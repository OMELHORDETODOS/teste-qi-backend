import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: ["https://omelhordetodos.github.io", "https://omelhordetodos.github.io/TESTEDEQIB"] }));

// Instancia Mercado Pago v2
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);
const preference = new Preference(client);

// Banco em memória
const ORDERS = new Map();

// Gera resultado
function computeIQResult(correct, total) {
  const iq = Math.round(100 + 15 * ((correct - total / 2) / (total * 0.18)));
  return { score: iq, label: iq >= 130 ? "Gênio" : iq >= 115 ? "Acima da média" : "Média" };
}

// 🟢 Criar pagamento via PIX
app.post("/create-pix", async (req, res) => {
  try {
    const { amount = 3.99, description = "Resultado Teste de QI Premium", correct, total } = req.body;
    const orderId = uuidv4();

    const data = await payment.create({
      body: {
        transaction_amount: Number(amount),
        description,
        payment_method_id: "pix",
        payer: { email: "cliente@teste.com" },
        external_reference: orderId,
        notification_url: "https://teste-qi-backend-om69.onrender.com/webhook"
      }
    });

    ORDERS.set(orderId, { id: orderId, correct, total, status: "pending", paymentId: data.id });

    res.json({
      id: data.id,
      orderId,
      qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: data.point_of_interaction.transaction_data.qr_code
    });
  } catch (err) {
    console.error("❌ Erro PIX:", err);
    res.status(400).json({ error: err.message });
  }
});

// 💳 Criar pagamento via cartão/boleto
app.post("/create-order", async (req, res) => {
  try {
    const orderId = uuidv4();
    const pref = await preference.create({
      body: {
        items: [
          {
            title: "Resultado Teste de QI Premium",
            quantity: 1,
            currency_id: "BRL",
            unit_price: 4.99
          }
        ],
        back_urls: {
          success: "https://omelhordetodos.github.io/TESTEDEQIB/resultado.html",
          failure: "https://omelhordetodos.github.io/TESTEDEQIB/resultado.html",
          pending: "https://omelhordetodos.github.io/TESTEDEQIB/resultado.html"
        },
        auto_return: "approved",
        external_reference: orderId,
        notification_url: "https://teste-qi-backend-om69.onrender.com/webhook"
      }
    });

    ORDERS.set(orderId, { id: orderId, status: "pending" });
    res.json({ init_point: pref.init_point, orderId });
  } catch (err) {
    console.error("❌ Erro Checkout:", err);
    res.status(400).json({ error: err.message });
  }
});

// 🔔 Webhook
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Webhook recebido:", body);

    if (body.type === "payment") {
      const paymentData = await payment.get({ id: body.data.id });
      const orderId = paymentData.external_reference;

      if (ORDERS.has(orderId)) {
        ORDERS.set(orderId, { ...ORDERS.get(orderId), status: paymentData.status });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro webhook:", err.message);
    res.sendStatus(500);
  }
});

// 🔍 Consultar status
app.get("/payment-status/:id", async (req, res) => {
  try {
    const payData = await payment.get({ id: req.params.id });
    const orderId = payData.external_reference;
    if (ORDERS.has(orderId)) {
      ORDERS.set(orderId, { ...ORDERS.get(orderId), status: payData.status });
    }
    res.json({ status: payData.status, orderId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🧠 Resultado
app.get("/result/:orderId", (req, res) => {
  const order = ORDERS.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  if (order.status !== "approved") return res.status(402).json({ error: "Pagamento não aprovado" });
  const result = computeIQResult(order.correct || 21, order.total || 42);
  res.json({ result });
});

// 🟡 Rota de status (teste + manter vivo)
app.get("/", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
