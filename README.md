# Teste de QI Premium — Backend (Node.js + Express + Mercado Pago SDK v2)

**Produção sugerida (Render):** https://testedeqib.onrender.com

## Rotas
- `POST /create-order` — Checkout Pro (Cartão/Boleto — R$ 4,99). Retorna `init_point`.
- `POST /create-pix` — Cria pagamento PIX (R$ 3,99). Retorna `id`, `qr_code`, `qr_code_base64`.
- `POST /webhook` — Recebe notificações do Mercado Pago e atualiza status por `external_reference`.
- `GET /payment-status/:paymentId` — Consulta status de um pagamento específico.
- `GET /status-by-ref/:ext` — Consulta status agregado por `external_reference` (usado pelo frontend para Checkout Pro).
- `GET /thanks` — Página simples de agradecimento/retorno.

## Variáveis de Ambiente
Veja `.env.example` e defina em produção:
```
MP_ACCESS_TOKEN=seu_token_do_mercado_pago
FRONTEND_URL=https://omelhordetodos.github.io
SERVER_URL=https://testedeqib.onrender.com
```

## Deploy no Render
1. Crie um **Web Service** (Node 18+).
2. **Build**: `npm install`  
   **Start**: `node server.js`
3. Em **Mercado Pago → Webhooks**, configure:
```
https://testedeqib.onrender.com/webhook
```
4. Aponte o frontend para `https://omelhordetodos.github.io/teste-qi-frontend/` (ou o nome que preferir).

## Observações
- O backend mantém um mapa em memória para status por `external_reference` (atualizado via webhook). Para persistência real, use um banco (ex.: Redis/Mongo).
- O Checkout Pro abre em nova aba; o frontend faz polling até `approved`.

---

💡 **Desenvolvido por Jean Gonzalez — 2025**
