import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // ← liberado para todas as origens (pode restringir depois se quiser)

// Configurar o Mercado Pago
mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });

// Banco em memória
const ORDERS = new Map();

// Função para gerar resultado
function computeIQResult(correct, total) {
  const iq = Math.round(100 + 15 * ((correct - total / 2) / (total * 0.18)));
  return {
    score: iq,
    label:
      iq > 130
        ? "Gênio"
        : iq >= 121
        ? "Brilhante"
        : iq >= 111
        ? "Inteligência elevada"
        : iq >= 101
        ? "Acima da média"
        : iq >= 91
        ? "Na média"
        : iq >= 81
        ? "Em desenvolvimento"
        : "Treine sua mente",
  };
}

// ✅ Criar pagamento via PIX
app.post("/create-pix", async (req, res) => {
  try {
    const { amount = 3.99, description = "Resultado Teste de QI Premium", correct, total } = req.body;
    const orderId = uuidv4();

    const payment = await mercadopago.payment.create({
      transaction_amount: Number(amount),
      description,
      payment_method_id: "pix",
      payer: { email: "cliente@teste.com" },
      external_reference: orderId,
      notification_url: `${process.env.SERVER_URL}/webhook`,
    });

    ORDERS.set(orderId, {
      id: orderId,
      correct,
      total,
      status: "pending",
      paymentId: payment.body.id,
    });

    res.json({
      id: payment.body.id,
      orderId,
      qr_code_base64: payment.body.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: payment.body.point_of_interaction.transaction_data.qr_code,
    });
  } catch (err) {
    console.error("❌ Erro PIX:", err.response?.body || err.message);
    res.status(400).json({ error: err.message });
  }
});

// 💳 Criar pagamento via Cartão/Boleto
app.post("/create-order", async (req, res) => {
  try {
    const orderId = uuidv4();
    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: "Resultado Teste de QI Premium",
          quantity: 1,
          currency_id: "BRL",
          unit_price: 4.99,
        },
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/resultado.html?orderId=${orderId}`,
        failure: `${process.env.FRONTEND_URL}/resultado.html`,
        pending: `${process.env.FRONTEND_URL}/resultado.html`,
      },
      auto_return: "approved",
      external_reference: orderId,
      notification_url: `${process.env.SERVER_URL}/webhook`,
    });

    ORDERS.set(orderId, { id: orderId, status: "pending" });

    res.json({ init_point: preference.body.init_point, orderId });
  } catch (err) {
    console.error("❌ Erro Checkout:", err.response?.body || err.message);
    res.status(400).json({ error: err.message });
  }
});

// 🔔 Webhook Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Webhook recebido:", body);

    if (body.type === "payment" && body.data?.id) {
      const payment = await mercadopago.payment.findById(body.data.id);
      const orderId = payment.body.external_reference;

      if (ORDERS.has(orderId)) {
        ORDERS.set(orderId, {
          ...ORDERS.get(orderId),
          status: payment.body.status,
        });
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
    const payment = await mercadopago.payment.get(req.params.id);
    const orderId = payment.body.external_reference;

    if (ORDERS.has(orderId)) {
      ORDERS.set(orderId, {
        ...ORDERS.get(orderId),
        status: payment.body.status,
      });
    }

    res.json({ status: payment.body.status, orderId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🧠 Resultado
app.get("/result/:orderId", (req, res) => {
  const order = ORDERS.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  if (order.status !== "approved")
    return res.status(402).json({ error: "Pagamento não aprovado" });
  const result = computeIQResult(order.correct || 21, order.total || 42);
  res.json({ result });
});

// 🏠 Rota padrão
app.get("/", (req, res) => {
  res.send("✅ Servidor Teste de QI Premium ativo e funcionando!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
