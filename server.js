// ==========================
// TESTE DE QI PREMIUM - BACKEND
// ==========================

import express from "express";
import cors from "cors";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

const app = express();

// ======== CONFIGURAÇÕES BÁSICAS ========
app.use(express.json());
app.use(cors({
  origin: [
    "https://omelhordetodos.github.io",
    "https://omelhordetodos.github.io/teste-qi-frontend"
  ],
}));

// ======== CONFIG MERCADO PAGO ========
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// ======== ROTAS ========

// ✅ Teste simples
app.get("/", (req, res) => {
  res.send("✅ Servidor Teste de QI Premium ativo e funcionando!");
});

// ✅ Criar pagamento PIX
app.post("/create-pix", async (req, res) => {
  try {
    const payment = new Payment(client);
    const result = await payment.create({
      body: {
        transaction_amount: Number(req.body.amount) || 3.99,
        description: req.body.description || "Resultado Teste de QI Premium",
        payment_method_id: "pix",
        payer: { email: "cliente@teste.com" },
      },
    });

    res.json({
      id: result.id,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      external_reference: result.external_reference
    });
  } catch (err) {
    console.error("❌ Erro PIX:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Criar pagamento via Cartão ou Boleto (Checkout Pro)
app.post("/create-order", async (req, res) => {
  try {
    const preference = new Preference(client);
    const result = await preference.create({
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
          success: `${process.env.FRONTEND_URL}/teste.html`,
          failure: `${process.env.FRONTEND_URL}/resultado.html`,
          pending: `${process.env.FRONTEND_URL}/resultado.html`
        },
        auto_return: "approved",
        external_reference: "qi_test_" + Date.now(),
        notification_url: `${process.env.SERVER_URL}/webhook`
      }
    });

    res.json({ init_point: result.init_point });
  } catch (err) {
    console.error("❌ Erro Checkout:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Webhook de notificação Mercado Pago
app.post("/webhook", (req, res) => {
  console.log("📩 Webhook recebido:", req.body);
  res.sendStatus(200);
});

// ✅ Consultar status de pagamento
app.get("/payment-status/:id", async (req, res) => {
  try {
    const payment = new Payment(client);
    const result = await payment.get({ id: req.params.id });
    res.json({ status: result.status });
  } catch (err) {
    console.error("❌ Erro consulta status:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ======== SERVIDOR ========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
