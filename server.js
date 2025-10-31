import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";

const app = express();

// ================= CONFIGURAÇÕES =================
app.use(express.json());
app.use(cors({
  origin: ["https://omelhordetodos.github.io"],
}));

// Configure o SDK Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// ================= ROTAS =================

// Teste simples
app.get("/", (req, res) => {
  res.send("✅ Servidor Teste de QI Premium ativo!");
});

// Criar pagamento via PIX
app.post("/create-pix", async (req, res) => {
  try {
    const payment = await mercadopago.payment.create({
      transaction_amount: Number(req.body.amount) || 3.99,
      description: req.body.description || "Resultado Teste de QI Premium",
      payment_method_id: "pix",
      payer: { email: "cliente@teste.com" },
    });
    res.json({
      id: payment.body.id,
      qr_code_base64: payment.body.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: payment.body.point_of_interaction.transaction_data.qr_code,
      external_reference: payment.body.external_reference
    });
  } catch (err) {
    console.error("Erro PIX:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// Criar pagamento via Cartão/Boleto (Checkout Pro)
app.post("/create-order", async (req, res) => {
  try {
    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: "Resultado Teste de QI Premium",
          quantity: 1,
          currency_id: "BRL",
          unit_price: 4.99
        }
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/teste.html`,
        failure: `${process.env.FRONTEND_URL}/resultado.html`,
        pending: `${process.env.FRONTEND_URL}/resultado.html`
      },
      auto_return: "approved",
      external_reference: "qi_test_" + Date.now(),
      notification_url: `${process.env.SERVER_URL}/webhook`
    });
    res.json({ init_point: preference.body.init_point });
  } catch (err) {
    console.error("Erro Checkout:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// Webhook Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(500);
  }
});

// Consulta de pagamento por ID
app.get("/payment-status/:id", async (req, res) => {
  try {
    const payment = await mercadopago.payment.get(req.params.id);
    res.json({ status: payment.body.status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= SERVIDOR =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
