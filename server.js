import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    "https://omelhordetodos.github.io", // seu frontend no GitHub Pages
    "https://testedeqib.onrender.com"   // domínio do backend no Render
  ]
}));

// Configuração Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// Banco em memória
const ORDERS = new Map();

// Gerar resultado
function computeIQResult(correct, total) {
  const iq = Math.round(100 + 15 * ((correct - total / 2) / (total * 0.18)));
  return { score: iq };
}

// =============== ROTA: CRIAR PIX ===============
app.post("/create-pix", async (req, res) => {
  try {
    const { amount = 3.99, description, correct, total } = req.body;
    const orderId = uuidv4();

    const payment = await mercadopago.payment.create({
      transaction_amount: Number(amount),
      description: description || "Resultado Teste de QI Premium",
      payment_method_id: "pix",
      payer: { email: "cliente@teste.com" },
      external_reference: orderId,
      notification_url: `${process.env.SERVER_URL}/webhook`,
    });

    ORDERS.set(orderId, { id: orderId, correct, total, status: "pending", paymentId: payment.body.id });

    console.log("✅ PIX criado:", orderId);
    res.json({
      id: payment.body.id,
      orderId,
      qr_code_base64: payment.body.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: payment.body.point_of_interaction.transaction_data.qr_code
    });
  } catch (err) {
    console.error("❌ Erro ao criar PIX:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// =============== ROTA: CRIAR CARTÃO ===============
app.post("/create-order", async (req, res) => {
  try {
    const orderId = uuidv4();
    const preference = await mercadopago.preferences.create({
      items: [{
        title: "Resultado Teste de QI Premium",
        quantity: 1,
        currency_id: "BRL",
        unit_price: 4.99
      }],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/resultado.html?orderId=${orderId}`,
        failure: `${process.env.FRONTEND_URL}/resultado.html`,
        pending: `${process.env.FRONTEND_URL}/resultado.html`
      },
      auto_return: "approved",
      external_reference: orderId,
      notification_url: `${process.env.SERVER_URL}/webhook`
    });

    ORDERS.set(orderId, { id: orderId, status: "pending" });
    console.log("✅ Pedido cartão criado:", orderId);

    res.json({ init_point: preference.body.init_point, orderId });
  } catch (err) {
    console.error("❌ Erro ao criar pedido cartão:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// =============== ROTA: WEBHOOK MERCADO PAGO ===============
app.post("/webhook", async (req, res) => {
  try {
    const { action, data, type } = req.body;
    console.log("📩 Webhook recebido:", req.body);

    const paymentId = data?.id || req.body?.data?.id || req.query["data.id"];
    if (paymentId) {
      const payment = await mercadopago.payment.findById(paymentId);
      const orderId = payment.body.external_reference;
      const status = payment.body.status;

      if (ORDERS.has(orderId)) {
        ORDERS.set(orderId, { ...ORDERS.get(orderId), status });
        console.log(`✅ Pedido ${orderId} atualizado para ${status}`);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro webhook:", err.message);
    res.sendStatus(500);
  }
});

// =============== ROTA: CONSULTAR STATUS ===============
app.get("/payment-status/:id", async (req, res) => {
  try {
    const payment = await mercadopago.payment.findById(req.params.id);
    const orderId = payment.body.external_reference;
    const status = payment.body.status;

    if (ORDERS.has(orderId)) ORDERS.set(orderId, { ...ORDERS.get(orderId), status });

    console.log(`🔍 Status ${req.params.id}: ${status}`);
    res.json({ status, orderId });
  } catch (err) {
    console.error("❌ Erro status:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// =============== ROTA: RESULTADO ===============
app.get("/result/:orderId", (req, res) => {
  const order = ORDERS.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  if (order.status !== "approved") return res.status(402).json({ error: "Pagamento não aprovado" });

  const result = computeIQResult(order.correct || 21, order.total || 42);
  console.log(`🧠 Resultado para ${order.id}: QI ${result.score}`);
  res.json({ result });
});

// =============== INICIAR SERVIDOR ===============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
