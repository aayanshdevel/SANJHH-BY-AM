/**
 * SANJHH BY AM — custom ecommerce server
 * Express + JSON datastore. Storefront APIs, secure admin APIs,
 * order/production/shipping workflow, payment-gateway architecture (Razorpay-ready),
 * and invoice generation.
 *
 * All secrets (admin credentials, Razorpay key secret, shipping API keys)
 * live in environment variables and are used server-side only.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const db = require('./lib/db');
const sec = require('./lib/security');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sanjhhbyam.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '200kb' }));

/* ── security headers ─────────────────────────────────────────────── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ── static assets (cache images aggressively, html lightly) ──────── */
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|svg|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

/* ══════════════════════════ helpers ═══════════════════════════════ */
const getProducts = () => db.read('products', { products: [] }).products;
const saveProducts = (products) => db.write('products', { products });
const getOrders = () => db.read('orders', { orders: [] }).orders;
const saveOrders = (orders) => db.write('orders', { orders });
const getSettings = () => db.read('settings', {});
const getDiscounts = () => db.read('discounts', { discounts: [] }).discounts;
const saveDiscounts = (d) => db.write('discounts', { discounts: d });
const getReviews = () => db.read('reviews', { reviews: [] }).reviews;
const saveReviews = (r) => db.write('reviews', { reviews: r });
const getCustomers = () => db.read('customers', { customers: [] }).customers;
const saveCustomers = (c) => db.write('customers', { customers: c });
const getMessages = () => db.read('messages', { messages: [] }).messages;
const saveMessages = (m) => db.write('messages', { messages: m });

const ONLINE_FLOW = ['Order Placed', 'Payment Confirmed', 'Production', 'Quality Check', 'Ready to Ship', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
const COD_FLOW = ['Order Placed', 'COD Confirmed', 'Production', 'Quality Check', 'Ready to Ship', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
const PRODUCTION_STAGES = ['Production Pending', 'Manufacturing', 'Quality Check', 'Ready to Pack', 'Packed', 'Ready to Ship'];

function statusFlow(order) { return order.paymentMethod === 'cod' ? COD_FLOW : ONLINE_FLOW; }

function publicProduct(p) { return p; } // catalogue data is public by design

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = sec.getSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorised' });
  req.admin = session;
  req.adminToken = token;
  next();
}

function orderSummary(o) {
  return {
    orderId: o.orderId, placedAt: o.placedAt, status: o.status,
    statusFlow: statusFlow(o), statusHistory: o.statusHistory,
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    items: o.items, subtotal: o.subtotal, discount: o.discount,
    shippingFee: o.shippingFee, codCharge: o.codCharge || 0, total: o.total,
    shipping: { courier: o.shipping.courier || '', awb: o.shipping.awb || '' },
    customer: { name: o.customer.name, city: o.customer.city, state: o.customer.state },
  };
}

/* ══════════════════════════ PUBLIC API ════════════════════════════ */

app.get('/api/products', (req, res) => {
  res.json({ products: getProducts().filter((p) => p.published).map(publicProduct) });
});

app.get('/api/products/:slug', (req, res) => {
  const p = getProducts().find((x) => x.slug === req.params.slug && x.published);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const reviews = getReviews().filter((r) => r.productId === p.id && r.approved);
  res.json({ product: publicProduct(p), reviews });
});

app.get('/api/settings/public', (req, res) => {
  const s = getSettings();
  res.json({
    announcement: s.store?.announcement || '',
    shipping: {
      flatRate: s.shipping?.flatRate ?? 79,
      freeAbove: s.shipping?.freeAbove ?? 1999,
      codEnabled: s.shipping?.codEnabled !== false,
      codCharge: s.shipping?.codCharge ?? 0,
      dispatchNote: s.shipping?.dispatchNote || '',
    },
    payments: {
      onlineEnabled: s.payments?.onlineEnabled !== false,
      mode: RZP_KEY_ID && RZP_KEY_SECRET ? 'live' : 'demo',
      // Only the PUBLIC key id is ever exposed; the secret stays server-side.
      keyId: RZP_KEY_ID || null,
    },
    tax: { enabled: !!s.tax?.enabled, label: s.tax?.label || 'GST', ratePct: s.tax?.ratePct || 0 },
  });
});

/* discount validation (server-side authority) */
function computeDiscount(code, subtotal) {
  if (!code) return { valid: false };
  const d = getDiscounts().find((x) => x.code.toUpperCase() === String(code).toUpperCase() && x.active);
  if (!d) return { valid: false, reason: 'Invalid or expired code' };
  if (d.minSubtotal && subtotal < d.minSubtotal) {
    return { valid: false, reason: `Add items worth ₹${d.minSubtotal - subtotal} more to use this code` };
  }
  let amount = d.type === 'percent' ? Math.round(subtotal * (d.value / 100)) : Math.round(d.value);
  if (d.maxDiscount) amount = Math.min(amount, d.maxDiscount);
  amount = Math.min(amount, subtotal);
  return { valid: true, code: d.code, amount, label: d.label || d.code };
}

app.post('/api/discounts/validate', sec.rateLimit(30, 60000), (req, res) => {
  const { code, subtotal } = req.body || {};
  res.json(computeDiscount(sec.strip(code, 40), Number(subtotal) || 0));
});

/* ── order creation ────────────────────────────────────────────────
   Prices are always recomputed server-side from the catalogue;
   client-submitted prices are ignored. */
app.post('/api/orders', sec.rateLimit(15, 60000), (req, res) => {
  try {
    const body = req.body || {};
    const c = body.customer || {};
    const customer = {
      name: sec.strip(c.name, 80),
      phone: String(c.phone || '').replace(/[\s-]/g, ''),
      email: sec.strip(c.email, 120).toLowerCase(),
      address: sec.stripMultiline(c.address, 400),
      city: sec.strip(c.city, 80),
      state: sec.strip(c.state, 80),
      pincode: sec.strip(c.pincode, 6),
    };

    if (customer.name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!sec.isPhone(customer.phone)) return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    if (!sec.isEmail(customer.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (customer.address.length < 8) return res.status(400).json({ error: 'Please enter your complete address.' });
    if (!customer.city || !customer.state) return res.status(400).json({ error: 'Please enter your city and state.' });
    if (!sec.isPincode(customer.pincode)) return res.status(400).json({ error: 'Please enter a valid 6-digit PIN code.' });

    const paymentMethod = body.paymentMethod === 'cod' ? 'cod' : 'online';
    const settings = getSettings();
    if (paymentMethod === 'cod' && settings.shipping?.codEnabled === false) {
      return res.status(400).json({ error: 'Cash on Delivery is currently unavailable.' });
    }

    const products = getProducts();
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Your cart is empty.' });

    const items = [];
    for (const it of rawItems) {
      const p = products.find((x) => x.id === it.productId && x.published);
      if (!p) return res.status(400).json({ error: 'One of the items is no longer available.' });
      const size = String(it.size || '');
      if (!p.sizes.includes(size)) return res.status(400).json({ error: `Please pick a valid size for ${p.name}.` });
      const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));
      const available = (p.stock && p.stock[size]) || 0;
      if (available < qty) {
        return res.status(400).json({ error: `${p.name} (size ${size}) has only ${available} left in stock.` });
      }
      items.push({
        productId: p.id, slug: p.slug, sku: p.sku, name: p.name, size, qty,
        mrp: p.mrp, price: p.salePrice, image: p.images[0]?.src || '',
      });
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const disc = computeDiscount(sec.strip(body.discountCode, 40), subtotal);
    const discount = disc.valid ? { code: disc.code, amount: disc.amount } : { code: '', amount: 0 };

    const freeAbove = settings.shipping?.freeAbove ?? 1999;
    const flatRate = settings.shipping?.flatRate ?? 79;
    const shippingFee = subtotal - discount.amount >= freeAbove ? 0 : flatRate;
    const codCharge = paymentMethod === 'cod' ? (settings.shipping?.codCharge ?? 0) : 0;
    const total = subtotal - discount.amount + shippingFee + codCharge;

    /* order id */
    const next = settings.orders?.nextNumber || 10001;
    const orderId = `${settings.orders?.prefix || 'SBAM-'}${next}`;
    settings.orders = { ...(settings.orders || {}), nextNumber: next + 1 };
    db.write('settings', settings);

    const now = new Date().toISOString();
    const initialStatus = 'Order Placed';
    const order = {
      orderId, placedAt: now, customer, items,
      subtotal, discount, shippingFee, codCharge, total,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'COD — collect on delivery' : 'Awaiting payment',
      payment: { gateway: paymentMethod === 'cod' ? null : (RZP_KEY_ID ? 'razorpay' : 'demo'), reference: '' },
      status: initialStatus,
      statusHistory: [{ status: initialStatus, at: now }],
      production: { stage: 'Production Pending', history: [{ stage: 'Production Pending', at: now }] },
      shipping: { provider: settings.shipping?.provider || '', courier: '', awb: '', labelUrl: '', pickupRequested: false, trackingUpdates: [] },
      invoiceNumber: '',
      accessKey: crypto.randomBytes(12).toString('hex'),
    };

    /* decrement stock */
    for (const it of items) {
      const p = products.find((x) => x.id === it.productId);
      p.stock[it.size] = Math.max(0, (p.stock[it.size] || 0) - it.qty);
    }
    saveProducts(products);

    /* auto-advance COD orders to COD Confirmed */
    if (paymentMethod === 'cod') {
      order.status = 'COD Confirmed';
      order.statusHistory.push({ status: 'COD Confirmed', at: now });
    }

    const orders = getOrders();
    orders.push(order);
    saveOrders(orders);

    /* upsert customer record */
    const customers = getCustomers();
    const existing = customers.find((x) => x.email === customer.email);
    if (existing) {
      existing.orders.push(orderId);
      existing.name = customer.name; existing.phone = customer.phone;
    } else {
      customers.push({ email: customer.email, name: customer.name, phone: customer.phone, since: now, orders: [orderId] });
    }
    saveCustomers(customers);

    const paymentMode = paymentMethod === 'cod' ? 'cod' : (RZP_KEY_ID && RZP_KEY_SECRET ? 'razorpay' : 'demo');
    res.status(201).json({
      orderId, total, accessKey: order.accessKey, paymentMode,
      razorpayKeyId: paymentMode === 'razorpay' ? RZP_KEY_ID : null,
    });
  } catch (e) {
    console.error('Order error:', e);
    res.status(500).json({ error: 'Something went wrong while placing your order. Please try again.' });
  }
});

/* ── payment confirmation ──────────────────────────────────────────
   Live mode: verify Razorpay HMAC signature server-side with the key secret.
   Demo mode (no keys configured): simulate a successful payment, clearly flagged. */
app.post('/api/payments/confirm', sec.rateLimit(20, 60000), (req, res) => {
  const { orderId, accessKey, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const orders = getOrders();
  const order = orders.find((o) => o.orderId === orderId && o.accessKey === accessKey);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.paymentMethod !== 'online') return res.status(400).json({ error: 'This order does not require online payment.' });
  if (order.paymentStatus === 'Paid') return res.json({ ok: true, status: order.status });

  if (RZP_KEY_ID && RZP_KEY_SECRET) {
    const expected = crypto.createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!sec.safeEqual(expected, String(razorpay_signature || ''))) {
      return res.status(400).json({ error: 'Payment verification failed.' });
    }
    order.payment.reference = sec.strip(razorpay_payment_id, 64);
  } else {
    order.payment.reference = `DEMO-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }

  const now = new Date().toISOString();
  order.paymentStatus = 'Paid';
  order.status = 'Payment Confirmed';
  order.statusHistory.push({ status: 'Payment Confirmed', at: now });
  saveOrders(orders);
  res.json({ ok: true, status: order.status, reference: order.payment.reference });
});

/* ── order tracking (order id + phone or email as proof) ──────────── */
app.get('/api/orders/track', sec.rateLimit(30, 60000), (req, res) => {
  const id = sec.strip(req.query.orderId, 24).toUpperCase();
  const contact = sec.strip(req.query.contact, 120).toLowerCase().replace(/[\s-]/g, '');
  const order = getOrders().find((o) => o.orderId.toUpperCase() === id);
  if (!order || !contact || (order.customer.email !== contact && order.customer.phone !== contact)) {
    return res.status(404).json({ error: 'No order found for those details. Check the order ID and the email/mobile used at checkout.' });
  }
  res.json({ order: orderSummary(order), accessKey: order.accessKey });
});

app.get('/api/orders/:orderId', sec.rateLimit(60, 60000), (req, res) => {
  const order = getOrders().find((o) => o.orderId === req.params.orderId && o.accessKey === req.query.key);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: orderSummary(order) });
});

/* ── invoice (HTML, printable) ─────────────────────────────────────── */
function ensureInvoiceNumber(order) {
  if (order.invoiceNumber) return order.invoiceNumber;
  const settings = getSettings();
  const n = settings.invoice?.nextNumber || 1001;
  order.invoiceNumber = `${settings.invoice?.prefix || 'SBAM-INV-'}${n}`;
  settings.invoice = { ...(settings.invoice || {}), nextNumber: n + 1 };
  db.write('settings', settings);
  return order.invoiceNumber;
}

function renderInvoice(order) {
  const s = getSettings();
  const e = sec.escapeHtml;
  const money = (v) => `₹${Number(v).toLocaleString('en-IN')}`;
  const taxLine = s.tax?.enabled
    ? `<tr><td colspan="5" class="r">${e(s.tax.label)} (${e(s.tax.ratePct)}%)</td><td class="r">included</td></tr>` : '';
  const gstin = s.tax?.enabled && s.tax?.gstin ? `<div class="muted">${e(s.tax.label)}IN: ${e(s.tax.gstin)}</div>` : '';
  const rows = order.items.map((i) => `
    <tr>
      <td>${e(i.name)}<div class="muted">SKU ${e(i.sku)} · Size ${e(i.size)}</div></td>
      <td class="r">${i.qty}</td>
      <td class="r">${money(i.mrp)}</td>
      <td class="r">${money(i.mrp - i.price)}</td>
      <td class="r">${money(i.price)}</td>
      <td class="r">${money(i.price * i.qty)}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${e(order.invoiceNumber)} — SANJHH BY AM</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;color:#26221c;margin:0;background:#f6f2ea}
    .sheet{max-width:820px;margin:24px auto;background:#fff;padding:48px;border:1px solid #e4dccd}
    h1{font-size:26px;letter-spacing:6px;margin:0}
    .sub{letter-spacing:3px;font-size:11px;color:#8a7f70;margin-top:4px}
    .row{display:flex;justify-content:space-between;gap:24px;margin-top:28px;flex-wrap:wrap}
    .box{font-size:13px;line-height:1.6;min-width:200px}
    .label{font-size:10px;letter-spacing:2px;color:#8a7f70;text-transform:uppercase;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin-top:28px;font-size:13px}
    th{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a7f70;text-align:left;border-bottom:1px solid #d9d0be;padding:8px 6px}
    td{padding:10px 6px;border-bottom:1px solid #eee7d8;vertical-align:top}
    .r{text-align:right}.muted{color:#8a7f70;font-size:11px}
    .totals td{border-bottom:none;padding:4px 6px}
    .grand td{border-top:1px solid #26221c;font-weight:bold;padding-top:10px}
    .foot{margin-top:36px;font-size:12px;color:#8a7f70;text-align:center;border-top:1px solid #eee7d8;padding-top:18px}
    @media print{body{background:#fff}.sheet{border:none;margin:0}}
  </style></head><body><div class="sheet">
    <h1>SANJHH BY AM</h1><div class="sub">TAX INVOICE</div>${gstin}
    <div class="row">
      <div class="box"><div class="label">Invoice</div>
        ${e(order.invoiceNumber)}<br>Order: ${e(order.orderId)}<br>Date: ${new Date(order.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div class="box"><div class="label">Billing & Shipping Address</div>
        ${e(order.customer.name)}<br>${e(order.customer.address)}<br>${e(order.customer.city)}, ${e(order.customer.state)} — ${e(order.customer.pincode)}<br>${e(order.customer.phone)} · ${e(order.customer.email)}</div>
      <div class="box"><div class="label">Payment</div>
        ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'}<br>${e(order.paymentStatus)}${order.payment.reference ? `<br>Ref: ${e(order.payment.reference)}` : ''}</div>
    </div>
    <table>
      <thead><tr><th>Product</th><th class="r">Qty</th><th class="r">MRP</th><th class="r">Discount</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tbody class="totals">
        <tr><td colspan="5" class="r">Subtotal</td><td class="r">${money(order.subtotal)}</td></tr>
        ${order.discount.amount ? `<tr><td colspan="5" class="r">Coupon (${e(order.discount.code)})</td><td class="r">− ${money(order.discount.amount)}</td></tr>` : ''}
        <tr><td colspan="5" class="r">Shipping</td><td class="r">${order.shippingFee ? money(order.shippingFee) : 'Free'}</td></tr>
        ${order.codCharge ? `<tr><td colspan="5" class="r">COD charge</td><td class="r">${money(order.codCharge)}</td></tr>` : ''}
        ${taxLine}
        <tr class="grand"><td colspan="5" class="r">Total</td><td class="r">${money(order.total)}</td></tr>
      </tbody>
    </table>
    <div class="foot">${e(s.invoice?.footerNote || 'Thank you for shopping with SANJHH BY AM.')}${s.invoice?.address ? `<br>${e(s.invoice.address)}` : ''}</div>
  </div><script>if(new URLSearchParams(location.search).get('print')==='1')window.print()</script></body></html>`;
}

app.get('/api/orders/:orderId/invoice', sec.rateLimit(30, 60000), (req, res) => {
  const orders = getOrders();
  const order = orders.find((o) => o.orderId === req.params.orderId && o.accessKey === req.query.key);
  if (!order) return res.status(404).send('Invoice not found');
  ensureInvoiceNumber(order);
  saveOrders(orders);
  res.type('html').send(renderInvoice(order));
});

/* ── contact messages ──────────────────────────────────────────────── */
app.post('/api/contact', sec.rateLimit(10, 60000), (req, res) => {
  const { name, email, message } = req.body || {};
  if (!sec.isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const msg = {
    id: crypto.randomBytes(8).toString('hex'),
    name: sec.strip(name, 80), email: sec.strip(email, 120),
    message: sec.stripMultiline(message, 2000), at: new Date().toISOString(), read: false,
  };
  if (msg.message.length < 5) return res.status(400).json({ error: 'Please write a message.' });
  const all = getMessages(); all.push(msg); saveMessages(all);
  res.json({ ok: true });
});

/* ══════════════════════════ ADMIN API ═════════════════════════════ */

app.post('/api/admin/login', sec.rateLimit(8, 60000), (req, res) => {
  const { email, password } = req.body || {};
  const okEmail = sec.safeEqual(String(email || '').toLowerCase(), ADMIN_EMAIL.toLowerCase());
  const okPass = sec.safeEqual(String(password || ''), ADMIN_PASSWORD);
  if (!okEmail || !okPass) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sec.createSession(ADMIN_EMAIL) });
});

app.post('/api/admin/logout', adminAuth, (req, res) => {
  sec.destroySession(req.adminToken);
  res.json({ ok: true });
});

app.get('/api/admin/overview', adminAuth, (req, res) => {
  const orders = getOrders();
  const products = getProducts();
  const revenue = orders.filter((o) => o.paymentStatus === 'Paid' || o.paymentMethod === 'cod')
    .reduce((s, o) => s + o.total, 0);
  const lowStock = [];
  products.forEach((p) => Object.entries(p.stock || {}).forEach(([sz, q]) => {
    if (q <= 3) lowStock.push({ name: p.name, size: sz, qty: q });
  }));
  res.json({
    totals: {
      orders: orders.length,
      revenue,
      pendingProduction: orders.filter((o) => !['Delivered', 'Shipped', 'Out for Delivery'].includes(o.status) && o.production.stage !== 'Ready to Ship').length,
      customers: getCustomers().length,
      products: products.length,
      unreadMessages: getMessages().filter((m) => !m.read).length,
    },
    recentOrders: orders.slice(-8).reverse().map(orderSummary),
    lowStock: lowStock.slice(0, 12),
  });
});

/* products CRUD */
app.get('/api/admin/products', adminAuth, (req, res) => res.json({ products: getProducts() }));

app.post('/api/admin/products', adminAuth, (req, res) => {
  const products = getProducts();
  const b = req.body || {};
  const name = sec.strip(b.name, 120);
  if (name.length < 3) return res.status(400).json({ error: 'Product name required' });
  const slug = (b.slug ? sec.strip(b.slug, 120) : name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (products.some((p) => p.slug === slug)) return res.status(400).json({ error: 'Slug already exists' });
  const p = {
    id: `p-${crypto.randomBytes(5).toString('hex')}`,
    slug, sku: sec.strip(b.sku, 40) || `SBAM-${Date.now()}`,
    name, category: sec.strip(b.category, 40) || 'coord-sets',
    mrp: Math.max(0, Number(b.mrp) || 0), salePrice: Math.max(0, Number(b.salePrice) || 0),
    discountPct: 0, color: { name: sec.strip(b.colorName, 60), hex: sec.strip(b.colorHex, 9) || '#ccc' },
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
    images: [], description: sec.stripMultiline(b.description, 2000),
    details: [], fabric: 'Fabric details coming soon', fit: '', care: [],
    occasions: [], tags: [], flags: { newArrival: false, bestseller: false, sale: false, featured: false },
    published: false, createdAt: new Date().toISOString().slice(0, 10),
  };
  p.discountPct = p.mrp > p.salePrice && p.mrp > 0 ? Math.round((1 - p.salePrice / p.mrp) * 100) : 0;
  products.push(p); saveProducts(products);
  res.status(201).json({ product: p });
});

app.put('/api/admin/products/:id', adminAuth, (req, res) => {
  const products = getProducts();
  const p = products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (b.name != null) p.name = sec.strip(b.name, 120);
  if (b.category != null) p.category = sec.strip(b.category, 40);
  if (b.mrp != null) p.mrp = Math.max(0, Number(b.mrp) || 0);
  if (b.salePrice != null) p.salePrice = Math.max(0, Number(b.salePrice) || 0);
  p.discountPct = p.mrp > p.salePrice && p.mrp > 0 ? Math.round((1 - p.salePrice / p.mrp) * 100) : 0;
  if (b.description != null) p.description = sec.stripMultiline(b.description, 2000);
  if (b.fabric != null) p.fabric = sec.strip(b.fabric, 300) || 'Fabric details coming soon';
  if (b.fit != null) p.fit = sec.strip(b.fit, 200);
  if (Array.isArray(b.details)) p.details = b.details.map((d) => sec.strip(d, 200)).filter(Boolean).slice(0, 12);
  if (Array.isArray(b.care)) p.care = b.care.map((d) => sec.strip(d, 120)).filter(Boolean).slice(0, 8);
  if (Array.isArray(b.sizes)) p.sizes = b.sizes.map((s) => sec.strip(s, 6)).filter(Boolean).slice(0, 8);
  if (b.stock && typeof b.stock === 'object') {
    for (const s of p.sizes) if (b.stock[s] != null) p.stock[s] = Math.max(0, parseInt(b.stock[s], 10) || 0);
  }
  if (b.color) p.color = { name: sec.strip(b.color.name, 60), hex: sec.strip(b.color.hex, 9) };
  if (b.flags) {
    for (const f of ['newArrival', 'bestseller', 'sale', 'featured']) {
      if (b.flags[f] != null) p.flags[f] = !!b.flags[f];
    }
  }
  if (b.published != null) p.published = !!b.published;
  if (Array.isArray(b.tags)) p.tags = b.tags.map((t) => sec.strip(t, 40)).filter(Boolean).slice(0, 15);
  if (Array.isArray(b.occasions)) p.occasions = b.occasions.map((t) => sec.strip(t, 40)).filter(Boolean).slice(0, 8);
  if (Array.isArray(b.images)) {
    p.images = b.images
      .filter((im) => im && typeof im.src === 'string' && im.src.startsWith('/images/'))
      .map((im) => ({ src: sec.strip(im.src, 300), alt: sec.strip(im.alt, 300) })).slice(0, 12);
  }
  saveProducts(products);
  res.json({ product: p });
});

app.delete('/api/admin/products/:id', adminAuth, (req, res) => {
  const products = getProducts();
  const idx = products.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  products.splice(idx, 1); saveProducts(products);
  res.json({ ok: true });
});

/* secure image upload (type + size restricted, stored under the product slug) */
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const products = getProducts();
      const p = products.find((x) => x.id === req.params.id);
      if (!p) return cb(new Error('Product not found'));
      const dir = path.join(__dirname, 'public', 'images', 'products', p.slug);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      cb(null, `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter(req, file, cb) {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

app.post('/api/admin/products/:id/images', adminAuth, upload.array('images', 6), (req, res) => {
  const products = getProducts();
  const p = products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  for (const f of req.files || []) {
    p.images.push({ src: `/images/products/${p.slug}/${f.filename}`, alt: `${p.name} — product image` });
  }
  saveProducts(products);
  res.json({ product: p });
});

/* orders */
app.get('/api/admin/orders', adminAuth, (req, res) => {
  res.json({ orders: getOrders().slice().reverse() });
});

app.put('/api/admin/orders/:orderId/status', adminAuth, (req, res) => {
  const orders = getOrders();
  const o = orders.find((x) => x.orderId === req.params.orderId);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const status = sec.strip(req.body.status, 40);
  if (!statusFlow(o).includes(status)) return res.status(400).json({ error: 'Invalid status for this order type' });
  o.status = status;
  o.statusHistory.push({ status, at: new Date().toISOString() });
  if (status === 'Payment Confirmed') o.paymentStatus = 'Paid';
  if (status === 'Delivered' && o.paymentMethod === 'cod') o.paymentStatus = 'Paid (COD collected)';
  saveOrders(orders);
  res.json({ order: o });
});

app.put('/api/admin/orders/:orderId/production', adminAuth, (req, res) => {
  const orders = getOrders();
  const o = orders.find((x) => x.orderId === req.params.orderId);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const stage = sec.strip(req.body.stage, 40);
  if (!PRODUCTION_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid production stage' });
  o.production.stage = stage;
  o.production.history.push({ stage, at: new Date().toISOString() });
  saveOrders(orders);
  res.json({ order: o });
});

app.put('/api/admin/orders/:orderId/shipping', adminAuth, (req, res) => {
  const orders = getOrders();
  const o = orders.find((x) => x.orderId === req.params.orderId);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (b.courier != null) o.shipping.courier = sec.strip(b.courier, 60);
  if (b.awb != null) o.shipping.awb = sec.strip(b.awb, 60);
  if (b.labelUrl != null) o.shipping.labelUrl = sec.strip(b.labelUrl, 300);
  if (b.pickupRequested != null) o.shipping.pickupRequested = !!b.pickupRequested;
  if (b.trackingNote) {
    o.shipping.trackingUpdates.push({ note: sec.strip(b.trackingNote, 200), at: new Date().toISOString() });
  }
  saveOrders(orders);
  res.json({ order: o });
});

app.get('/api/admin/orders/:orderId/invoice', adminAuth, (req, res) => {
  const orders = getOrders();
  const order = orders.find((o) => o.orderId === req.params.orderId);
  if (!order) return res.status(404).send('Not found');
  ensureInvoiceNumber(order);
  saveOrders(orders);
  res.type('html').send(renderInvoice(order));
});

/* customers / payments / messages */
app.get('/api/admin/customers', adminAuth, (req, res) => res.json({ customers: getCustomers().slice().reverse() }));
app.get('/api/admin/payments', adminAuth, (req, res) => {
  res.json({
    payments: getOrders().slice().reverse().map((o) => ({
      orderId: o.orderId, at: o.placedAt, method: o.paymentMethod,
      gateway: o.payment.gateway, reference: o.payment.reference,
      status: o.paymentStatus, amount: o.total,
    })),
    gatewayMode: RZP_KEY_ID && RZP_KEY_SECRET ? 'razorpay (live keys configured)' : 'demo (add Razorpay keys in environment to go live)',
  });
});
app.get('/api/admin/messages', adminAuth, (req, res) => {
  const msgs = getMessages().slice().reverse();
  res.json({ messages: msgs });
});

/* discounts CRUD */
app.get('/api/admin/discounts', adminAuth, (req, res) => res.json({ discounts: getDiscounts() }));
app.post('/api/admin/discounts', adminAuth, (req, res) => {
  const b = req.body || {};
  const code = sec.strip(b.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) return res.status(400).json({ error: 'Code must be at least 3 characters' });
  const discounts = getDiscounts();
  if (discounts.some((d) => d.code === code)) return res.status(400).json({ error: 'Code already exists' });
  const d = {
    id: crypto.randomBytes(6).toString('hex'), code,
    label: sec.strip(b.label, 80),
    type: b.type === 'flat' ? 'flat' : 'percent',
    value: Math.max(0, Number(b.value) || 0),
    minSubtotal: Math.max(0, Number(b.minSubtotal) || 0),
    maxDiscount: Math.max(0, Number(b.maxDiscount) || 0),
    active: b.active !== false,
    createdAt: new Date().toISOString(),
  };
  discounts.push(d); saveDiscounts(discounts);
  res.status(201).json({ discount: d });
});
app.put('/api/admin/discounts/:id', adminAuth, (req, res) => {
  const discounts = getDiscounts();
  const d = discounts.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (req.body.active != null) d.active = !!req.body.active;
  saveDiscounts(discounts);
  res.json({ discount: d });
});
app.delete('/api/admin/discounts/:id', adminAuth, (req, res) => {
  saveDiscounts(getDiscounts().filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

/* reviews moderation */
app.get('/api/admin/reviews', adminAuth, (req, res) => res.json({ reviews: getReviews() }));
app.put('/api/admin/reviews/:id', adminAuth, (req, res) => {
  const reviews = getReviews();
  const r = reviews.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (req.body.approved != null) r.approved = !!req.body.approved;
  saveReviews(reviews);
  res.json({ review: r });
});

/* settings */
app.get('/api/admin/settings', adminAuth, (req, res) => res.json({ settings: getSettings() }));
app.put('/api/admin/settings', adminAuth, (req, res) => {
  const s = getSettings();
  const b = req.body || {};
  if (b.store) {
    s.store = s.store || {};
    if (b.store.announcement != null) s.store.announcement = sec.strip(b.store.announcement, 140);
    if (b.store.tagline != null) s.store.tagline = sec.strip(b.store.tagline, 140);
  }
  if (b.shipping) {
    s.shipping = s.shipping || {};
    for (const k of ['flatRate', 'freeAbove', 'codCharge']) {
      if (b.shipping[k] != null) s.shipping[k] = Math.max(0, Number(b.shipping[k]) || 0);
    }
    if (b.shipping.codEnabled != null) s.shipping.codEnabled = !!b.shipping.codEnabled;
    if (b.shipping.provider != null) s.shipping.provider = sec.strip(b.shipping.provider, 60);
    if (b.shipping.dispatchNote != null) s.shipping.dispatchNote = sec.strip(b.shipping.dispatchNote, 300);
  }
  if (b.tax) {
    s.tax = s.tax || {};
    if (b.tax.enabled != null) s.tax.enabled = !!b.tax.enabled;
    if (b.tax.label != null) s.tax.label = sec.strip(b.tax.label, 20);
    if (b.tax.gstin != null) s.tax.gstin = sec.strip(b.tax.gstin, 20);
    if (b.tax.ratePct != null) s.tax.ratePct = Math.max(0, Math.min(28, Number(b.tax.ratePct) || 0));
  }
  if (b.payments) {
    s.payments = s.payments || {};
    if (b.payments.onlineEnabled != null) s.payments.onlineEnabled = !!b.payments.onlineEnabled;
  }
  if (b.invoice) {
    s.invoice = s.invoice || {};
    if (b.invoice.address != null) s.invoice.address = sec.strip(b.invoice.address, 300);
    if (b.invoice.footerNote != null) s.invoice.footerNote = sec.strip(b.invoice.footerNote, 200);
  }
  db.write('settings', s);
  res.json({ settings: s });
});

/* ── 404 for unknown API routes, SPA-ish fallbacks handled by static ── */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SANJHH BY AM store running on http://0.0.0.0:${PORT}`);
  console.log(`Admin dashboard: /admin  (email: ${ADMIN_EMAIL})`);
  if (!process.env.ADMIN_PASSWORD) console.log('⚠ Using default dev admin password — set ADMIN_PASSWORD in production.');
  if (!RZP_KEY_ID) console.log('ℹ Payments in DEMO mode — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to go live.');
});
