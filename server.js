import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = express();

// 🔧 Configurações
app.use(express.json());
app.use(
  cors({
    origin: [
      "https://omelhordetodos.github.io",
      "https://omelhordetodos.github.io/TESTEDEQIB",
      "http://localhost:3000",
    ],
  })
);

// ✅ Inicialização Mercado Pago
mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });

// 🔄 Banco em memória
const ORDERS = new Map();

// 🧠 Função de cálculo do QI
function computeIQResult(correct, total) {
  const iq = Math.round(100 + 15 * ((correct - total / 2) / (total * 0.18)));
  let label = "Média";
  if (iq >= 130) label = "Gênio";
  else if (iq >= 115) label = "Acima da média";
  return { score: iq, label };
}

// ✅ Rota de status inicial (ping)
app.get("/", (req, res) => {
  res.json({ status: "✅ Servidor Teste de QI Premium ativo e funcionando!" });
});

// 🧾 Criar pagamento PIX
app.post("/create-pix", async (req, res) => {
  try {
    const { amount = 3.99, description, correct, total } = req.body;
    const orderId = uuidv4();

    console.log("📦 Nova cobrança PIX criada:", orderId, amount);

    const payment = await mercadopago.payment.create({
      transaction_amount: Number(amount),
      description: description || "Resultado Teste de QI Premium",
      payment_method_id: "pix",
      payer: { email: "cliente@teste.com" },
      external_reference: orderId,
      notification_url: `https://teste-qi-backend-om69.onrender.com/webhook`,
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
      qr_code_base64:
        payment.body.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: payment.body.point_of_interaction.transaction_data.qr_code,
    });
  } catch (err) {
    console.error("❌ Erro ao criar PIX:", err);
    res.status(400).json({ error: err.message });
  }
});

// 💳 Criar pagamento Cartão/Boleto
app.post("/create-order", async (req, res) => {
  try {
    const orderId = uuidv4();
    console.log("💳 Novo checkout criado:", orderId);

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
        success: `${process.env.FRONTEND_URL}/resultado.html?status=approved&orderId=${orderId}`,
        failure: `${process.env.FRONTEND_URL}/resultado.html?status=failure`,
        pending: `${process.env.FRONTEND_URL}/resultado.html?status=pending`,
      },
      auto_return: "approved",
      external_reference: orderId,
      notification_url: `https://teste-qi-backend-om69.onrender.com/webhook`,
    });

    ORDERS.set(orderId, { id: orderId, status: "pending" });
    res.json({ init_point: preference.body.init_point, orderId });
  } catch (err) {
    console.error("❌ Erro Checkout:", err);
    res.status(400).json({ error: err.message });
  }
});

// 🔔 Webhook Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", req.body);

    const paymentId =
      req.body.data?.id || req.query["data.id"] || req.body.id || null;
    if (!paymentId) return res.sendStatus(200);

    const payment = await mercadopago.payment.findById(paymentId);
    const orderId = payment.body.external_reference;
    const status = payment.body.status;

    console.log(`🧾 Pagamento ${paymentId} - Status: ${status}`);

    if (ORDERS.has(orderId)) {
      ORDERS.set(orderId, { ...ORDERS.get(orderId), status });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro webhook:", err);
    res.sendStatus(500);
  }
});

// 🔍 Consultar status
app.get("/payment-status/:id", async (req, res) => {
  try {
    const payment = await mercadopago.payment.get(req.params.id);
    const orderId = payment.body.external_reference;
    const status = payment.body.status;

    if (ORDERS.has(orderId)) {
      ORDERS.set(orderId, { ...ORDERS.get(orderId), status });
    }

    res.json({ status, orderId });
  } catch (err) {
    console.error("❌ Erro status:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// 🧠 Gerar resultado
app.get("/result/:orderId", (req, res) => {
  const order = ORDERS.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  if (order.status !== "approved")
    return res.status(402).json({ error: "Pagamento não aprovado" });

  const result = computeIQResult(order.correct || 21, order.total || 42);
  res.json({ result });
});

// 🚨 Fallback: qualquer rota inválida
app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
    path: req.originalUrl,
  });
});

// 🚀 Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Servidor rodando na porta ${PORT} — Teste de QI Premium`)
);
