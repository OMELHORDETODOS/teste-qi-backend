import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — permite GitHub Pages e também localhost para testes
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://omelhordetodos.github.io';
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5500', 'http://127.0.0.1:5500'],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Mercado Pago
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if(!ACCESS_TOKEN){ console.error('MP_ACCESS_TOKEN não definido'); }
const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });

// memória simples para status por external_reference (atualizado pelo webhook)
const statusByRef = new Map();

function updateStatusByRef(external_reference, paymentId, status){
  if(!external_reference) return;
  statusByRef.set(external_reference, { paymentId, status, updatedAt: Date.now() });
}

// 1) Cartão/Boleto via Checkout Pro (Preference)
app.post('/create-order', async (req,res)=>{
  try{
    const { external_reference = `ref_${Date.now()}` } = req.body || {};
    const pref = await new Preference(client).create({
      body: {
        items: [{ title: 'Resultado Teste de QI Premium', quantity: 1, unit_price: 4.99, currency_id: 'BRL' }],
        external_reference,
        back_urls: {
          success: (process.env.SERVER_URL || '') + '/thanks',
          failure: (process.env.SERVER_URL || '') + '/thanks',
          pending: (process.env.SERVER_URL || '') + '/thanks'
        },
        auto_return: 'approved',
        notification_url: (process.env.SERVER_URL || '') + '/webhook',
        payment_methods: { excluded_payment_types: [] },
        statement_descriptor: 'TESTE QI PREMIUM'
      }
    });
    res.json({ init_point: pref.init_point, id: pref.id, external_reference });
  }catch(e){
    console.error('create-order error', e);
    res.status(500).json({ error: 'create-order failed' });
  }
});

// 2) PIX
app.post('/create-pix', async (req,res)=>{
  try{
    const { amount = 3.99, description = 'Resultado Teste de QI Premium', external_reference } = req.body || {};
    const pay = await new Payment(client).create({
      body: {
        transaction_amount: Number(amount),
        description,
        payment_method_id: 'pix',
        external_reference: external_reference || `ref_${Date.now()}`,
        notification_url: (process.env.SERVER_URL || '') + '/webhook',
        payer: { email: 'comprador@exemplo.com' }
      }
    });
    const tx = pay.point_of_interaction?.transaction_data || {};
    res.json({
      id: pay.id,
      status: pay.status,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64,
      external_reference: pay.external_reference
    });
  }catch(e){
    console.error('create-pix error', e);
    res.status(500).json({ error: 'create-pix failed' });
  }
});

// 3) Webhook — atualiza status por external_reference
app.post('/webhook', async (req,res)=>{
  try{
    const event = req.body || {};
    const id = event.data?.id || event['data.id'] || event.id;
    if(id){
      try{
        const payment = await new Payment(client).get({ id });
        updateStatusByRef(payment.external_reference, payment.id, payment.status);
        console.log('Webhook:', payment.id, payment.status, payment.external_reference);
      }catch(err){ console.error('Erro ao consultar pagamento no webhook', err); }
    }
    res.status(200).json({ received: true });
  }catch(e){
    console.error('webhook error', e);
    res.status(500).json({ error: 'webhook failed' });
  }
});

// 4) Consulta status por paymentId
app.get('/payment-status/:paymentId', async (req,res)=>{
  try{
    const payment = await new Payment(client).get({ id: req.params.paymentId });
    res.json({ id: payment.id, status: payment.status, external_reference: payment.external_reference });
  }catch(e){
    console.error('payment-status error', e);
    res.status(500).json({ error: 'payment-status failed' });
  }
});

// Extra: consulta por external_reference
app.get('/status-by-ref/:ext', (req,res)=>{
  const val = statusByRef.get(req.params.ext);
  res.json(val || { status: 'unknown' });
});

app.get('/thanks', (req,res)=>{
  res.type('html').send('<html><body style="font-family:Arial;background:#0b0b0e;color:#eee"><h2>Obrigado!</h2><p>Retorne ao teste. O resultado será liberado automaticamente quando o pagamento for aprovado.</p></body></html>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server on http://localhost:'+PORT));
