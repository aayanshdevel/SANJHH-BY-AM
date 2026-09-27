# SANJHH BY AM — Ecommerce Website

Custom-built women's fashion storefront + admin dashboard. No Shopify/WooCommerce — a lightweight
Node.js (Express) application with a JSON datastore, designed so a real payment gateway (Razorpay)
and a shipping aggregator can be wired in without changing the architecture.

## Quick start

```bash
npm install
npm start
# → http://localhost:3000        (storefront)
# → http://localhost:3000/admin  (admin dashboard)
```

### Default dev admin login (CHANGE BEFORE LAUNCH)
- Email: `admin@sanjhhbyam.local`
- Password: `ChangeThisPassword123!`

Set real credentials via environment variables (see `.env.example`):
`ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Payments

- With no keys configured, the store runs in a clearly-labelled **demo payment mode**
  (online payments are simulated so the full order flow can be tested end-to-end).
- To go live: set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the server environment.
  - Only the public key id is ever sent to the browser.
  - Payment signatures are verified **server-side** with HMAC-SHA256 (`/api/payments/confirm`).
- Cash on Delivery is supported with an optional COD handling charge (Admin → Store Settings).

## Orders & production

- Order IDs: `SBAM-10001`, `SBAM-10002`, … (prefix/counter in `data/settings.json`).
- Online flow: Order Placed → Payment Confirmed → Production → Quality Check → Ready to Ship → Packed → Shipped → Out for Delivery → Delivered.
- COD flow: Order Placed → COD Confirmed → … (same tail).
- Separate production pipeline (Admin → Production): Production Pending → Manufacturing → Quality Check → Ready to Pack → Packed → Ready to Ship.
- Customers track orders at `/track-order.html` using order ID + the email/phone used at checkout.
- Printable invoices are generated server-side; GST/tax fields are **off by default** and editable in Admin → Store Settings (nothing is invented).

## Shipping

Provider-agnostic: `data/settings.json` stores the provider name, and each order carries
`shipping.courier`, `shipping.awb`, `shipping.labelUrl`, `shipping.pickupRequested`,
`shipping.trackingUpdates`. Aggregator API keys belong in `SHIPPING_API_KEY` / `SHIPPING_API_SECRET`
environment variables (server-side only).

## Security notes

- Admin auth: environment credentials, constant-time comparison, random 256-bit bearer tokens, 8h expiry.
- Server-side validation & sanitisation of all inputs; prices/discounts/stock are always recomputed server-side.
- Rate limiting on login, orders, payments, tracking and contact endpoints.
- Image uploads restricted by MIME type and size, stored with generated filenames.
- Security headers (nosniff, frame options, referrer policy). No secrets in client code.

## Images & licensing

- All product imagery: brand-owned SANJHH BY AM photos supplied for this build
  (`public/images/products/**`), including panel crops from the product sheets.
- `public/images/editorial/*`: AI-generated decorative imagery created for this project
  (no people, no third-party IP) — safe for commercial use. See `public/images/IMAGE-SOURCES.md`.
- The Azure Muse Denim Jumpsuit uses a branded placeholder until its photography is supplied
  (no imagery was invented for a real product).

## Catalogue

Exactly the 11 products supplied by the brand, with the exact MRPs/sale prices provided.
Sizes S–XXL. Structured data lives in `data/products.json` and is fully editable from
Admin → Products (prices, stock, sizes, descriptions, flags, images).
