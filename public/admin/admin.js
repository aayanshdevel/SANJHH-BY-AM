/* SANJHH BY AM — Admin dashboard SPA */
(function () {
  'use strict';
  let token = sessionStorage.getItem('sbam_admin_token') || '';
  let view = 'dashboard';
  const app = document.getElementById('app');
  const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (s) => s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const ONLINE_FLOW = ['Order Placed', 'Payment Confirmed', 'Production', 'Quality Check', 'Ready to Ship', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
  const COD_FLOW = ['Order Placed', 'COD Confirmed', 'Production', 'Quality Check', 'Ready to Ship', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
  const PROD = ['Production Pending', 'Manufacturing', 'Quality Check', 'Ready to Pack', 'Packed', 'Ready to Ship'];
  const CATS = { 'dresses': 'Dresses', 'jumpsuits': 'Jumpsuits', 'coord-sets': 'Co-ord Sets', 'ethnic-occasion': 'Ethnic & Occasion' };

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin' + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
    });
    if (r.status === 401) { token = ''; sessionStorage.removeItem('sbam_admin_token'); renderLogin(); throw new Error('Session expired'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  let toastTimer;
  function toast(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function modal(html) {
    document.getElementById('modalBox').innerHTML = `<button class="x" onclick="closeModal()">×</button>` + html;
    document.getElementById('modalScrim').classList.add('open');
  }
  window.closeModal = () => document.getElementById('modalScrim').classList.remove('open');
  document.getElementById('modalScrim').addEventListener('click', (e) => { if (e.target.id === 'modalScrim') closeModal(); });

  /* ══ LOGIN ══ */
  function renderLogin() {
    app.innerHTML = `<div class="login-wrap"><form class="login-card" id="loginForm">
      <div class="brand">SANJHH</div><div class="sub">BY AM — ADMIN</div>
      <input id="lEmail" type="email" placeholder="Admin email" autocomplete="username" required>
      <input id="lPass" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="btn" style="width:100%;justify-content:center" type="submit">Sign In</button>
      <div class="err" id="lErr"></div>
      <p class="muted" style="margin-top:16px">Credentials are set via ADMIN_EMAIL / ADMIN_PASSWORD environment variables.</p>
    </form></div>`;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await fetch('/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: lEmail.value, password: lPass.value }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Login failed');
        token = d.token; sessionStorage.setItem('sbam_admin_token', token);
        renderShell(); go('dashboard');
      } catch (ex) { document.getElementById('lErr').textContent = ex.message; }
    });
  }

  /* ══ SHELL ══ */
  const SECTIONS = [
    ['dashboard', 'Dashboard'], ['products', 'Products'], ['orders', 'Orders'],
    ['production', 'Production'], ['inventory', 'Inventory'], ['customers', 'Customers'],
    ['payments', 'Payments'], ['shipping', 'Shipping'], ['discounts', 'Discounts'],
    ['reviews', 'Reviews'], ['messages', 'Messages'], ['settings', 'Store Settings'],
  ];
  function renderShell() {
    app.innerHTML = `<div class="layout">
      <aside class="side">
        <div class="brand">SANJHH</div><div class="sub">BY AM — Admin</div>
        <nav>${SECTIONS.map(([id, l]) => `<button data-v="${id}">${l}</button>`).join('')}</nav>
        <button class="logout" id="logoutBtn">Sign Out</button>
      </aside>
      <main class="main" id="mainView"></main>
    </div>`;
    app.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await api('/logout', { method: 'POST' }); } catch {}
      token = ''; sessionStorage.removeItem('sbam_admin_token'); renderLogin();
    });
  }
  function go(v) {
    view = v;
    app.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    const el = document.getElementById('mainView');
    el.innerHTML = '<p class="muted">Loading…</p>';
    ({ dashboard, products, orders, production, inventory, customers, payments, shipping, discounts, reviews, messages, settings })[v](el).catch((e) => {
      el.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    });
  }

  /* ══ DASHBOARD ══ */
  async function dashboard(el) {
    const d = await api('/overview');
    el.innerHTML = `<h1>Dashboard</h1>
      <div class="cards">
        <div class="stat"><div class="v">${d.totals.orders}</div><div class="l">Orders</div></div>
        <div class="stat"><div class="v">${money(d.totals.revenue)}</div><div class="l">Revenue</div></div>
        <div class="stat"><div class="v">${d.totals.pendingProduction}</div><div class="l">In Pipeline</div></div>
        <div class="stat"><div class="v">${d.totals.customers}</div><div class="l">Customers</div></div>
        <div class="stat"><div class="v">${d.totals.products}</div><div class="l">Products</div></div>
        <div class="stat"><div class="v">${d.totals.unreadMessages}</div><div class="l">New Messages</div></div>
      </div>
      <div class="panel"><h2>Recent Orders</h2>
        ${d.recentOrders.length ? `<table><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th></tr>
        ${d.recentOrders.map((o) => `<tr><td>${esc(o.orderId)}</td><td>${esc(o.customer.name)}</td>
          <td><span class="tag gold">${esc(o.status)}</span></td><td>${esc(o.paymentStatus)}</td><td>${money(o.total)}</td></tr>`).join('')}</table>`
        : '<p class="muted">No orders yet. New orders appear here the moment they are placed.</p>'}
      </div>
      <div class="panel"><h2>Low Stock Alerts (≤ 3)</h2>
        ${d.lowStock.length ? `<table><tr><th>Product</th><th>Size</th><th>Left</th></tr>
        ${d.lowStock.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.size}</td><td><span class="tag r">${l.qty}</span></td></tr>`).join('')}</table>`
        : '<p class="muted">All sizes are healthily stocked.</p>'}
      </div>`;
  }

  /* ══ PRODUCTS ══ */
  async function products(el) {
    const { products: P } = await api('/products');
    el.innerHTML = `<h1>Products</h1>
      <div class="row" style="margin-bottom:16px"><button class="btn" id="addP">+ Add Product</button></div>
      <div class="panel"><table><tr><th></th><th>Product</th><th>Category</th><th>MRP</th><th>Sale</th><th>Off</th><th>Stock</th><th>Flags</th><th>Status</th><th></th></tr>
      ${P.map((p) => {
        const stock = Object.values(p.stock || {}).reduce((a, b) => a + b, 0);
        const flags = [p.flags.newArrival && 'New', p.flags.bestseller && 'Bestseller', p.flags.sale && 'Sale', p.flags.featured && 'Featured'].filter(Boolean).join(', ');
        return `<tr><td><img class="thumb" src="${p.images[0]?.src || ''}" alt=""></td>
          <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.sku)}</div></td>
          <td>${CATS[p.category] || esc(p.category)}</td><td>${money(p.mrp)}</td><td>${money(p.salePrice)}</td>
          <td>${p.discountPct}%</td><td>${stock}</td><td class="muted">${flags || '—'}</td>
          <td>${p.published ? '<span class="tag g">Live</span>' : '<span class="tag">Draft</span>'}</td>
          <td><button class="btn sm ghost" data-edit="${p.id}">Edit</button></td></tr>`;
      }).join('')}</table></div>`;
    el.querySelector('#addP').onclick = () => editProduct(null);
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editProduct(P.find((x) => x.id === b.dataset.edit)));
  }

  function editProduct(p) {
    const isNew = !p;
    p = p || { name: '', sku: '', category: 'dresses', mrp: 0, salePrice: 0, color: { name: '', hex: '#cccccc' }, sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, images: [], description: '', details: [], fabric: 'Fabric details coming soon', fit: '', care: [], flags: {}, published: false };
    modal(`<h2>${isNew ? 'Add Product' : 'Edit — ' + esc(p.name)}</h2>
      <div class="grid2">
        <div class="field"><label>Name</label><input id="pName" value="${esc(p.name)}" style="width:100%"></div>
        <div class="field"><label>SKU</label><input id="pSku" value="${esc(p.sku)}" style="width:100%"></div>
        <div class="field"><label>Category</label><select id="pCat" style="width:100%">
          ${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Colour name / hex</label><div class="row">
          <input id="pColorName" value="${esc(p.color?.name || '')}" style="flex:1">
          <input id="pColorHex" type="color" value="${/^#([0-9a-f]{6})$/i.test(p.color?.hex||'') ? p.color.hex : '#cccccc'}" style="padding:2px;width:44px;height:38px"></div></div>
        <div class="field"><label>MRP (₹)</label><input id="pMrp" type="number" min="0" value="${p.mrp}" style="width:100%"></div>
        <div class="field"><label>Sale price (₹)</label><input id="pSale" type="number" min="0" value="${p.salePrice}" style="width:100%"></div>
      </div>
      <div class="field"><label>Description</label><textarea id="pDesc" rows="3" style="width:100%">${esc(p.description)}</textarea></div>
      <div class="field"><label>Details (one per line)</label><textarea id="pDetails" rows="3" style="width:100%">${esc((p.details || []).join('\n'))}</textarea></div>
      <div class="grid2">
        <div class="field"><label>Fabric (leave blank → "Fabric details coming soon")</label><input id="pFabric" value="${esc(p.fabric === 'Fabric details coming soon' ? '' : p.fabric)}" style="width:100%"></div>
        <div class="field"><label>Fit</label><input id="pFit" value="${esc(p.fit)}" style="width:100%"></div>
      </div>
      <div class="field"><label>Care (one per line)</label><textarea id="pCare" rows="2" style="width:100%">${esc((p.care || []).join('\n'))}</textarea></div>
      <div class="field"><label>Stock per size</label><div class="stockgrid">
        ${['S', 'M', 'L', 'XL', 'XXL'].map((s) => `<div><div class="muted" style="text-align:center">${s}</div><input id="st${s}" type="number" min="0" value="${(p.stock || {})[s] || 0}"></div>`).join('')}
      </div></div>
      <div class="row" style="margin:10px 0 16px">
        ${['newArrival:New Arrival', 'bestseller:Bestseller', 'sale:Sale', 'featured:Featured'].map((f) => {
          const [k, l] = f.split(':');
          return `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="fl_${k}" ${p.flags?.[k] ? 'checked' : ''}>${l}</label>`;
        }).join('')}
        <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="pPub" ${p.published ? 'checked' : ''}><strong>Published (visible in store)</strong></label>
      </div>
      ${isNew ? '<p class="muted">Save the product first, then upload images.</p>' : `
      <div class="field"><label>Images (first = card image; drag not supported — remove &amp; re-upload to reorder)</label>
        <div class="imgs" id="pImgs">${p.images.map((im, i) => `<div class="im"><img src="${im.src}" title="${esc(im.alt)}"><button class="rmimg" data-rm="${i}">×</button></div>`).join('')}</div>
        <div class="row" style="margin-top:10px"><input type="file" id="pFiles" multiple accept="image/jpeg,image/png,image/webp">
        <button class="btn sm ghost" id="upBtn">Upload</button></div></div>`}
      <div class="row" style="margin-top:14px">
        <button class="btn" id="saveP">${isNew ? 'Create Product' : 'Save Changes'}</button>
        ${isNew ? '' : `<button class="btn danger" id="delP">Delete</button>`}
      </div>`);

    const g = (id) => document.getElementById(id);
    if (!isNew) {
      document.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
        const images = p.images.filter((_, i) => i !== +b.dataset.rm);
        await api(`/products/${p.id}`, { method: 'PUT', body: JSON.stringify({ images }) });
        toast('Image removed'); closeModal(); go('products');
      });
      g('upBtn').onclick = async () => {
        const files = g('pFiles').files;
        if (!files.length) return toast('Choose image files first');
        const fd = new FormData();
        for (const f of files) fd.append('images', f);
        const r = await fetch(`/api/admin/products/${p.id}/images`, {
          method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
        });
        if (!r.ok) return toast('Upload failed');
        toast('Images uploaded'); closeModal(); go('products');
      };
      g('delP').onclick = async () => {
        if (!confirm('Delete this product permanently?')) return;
        await api(`/products/${p.id}`, { method: 'DELETE' });
        toast('Product deleted'); closeModal(); go('products');
      };
    }
    g('saveP').onclick = async () => {
      const body = {
        name: g('pName').value, sku: g('pSku').value, category: g('pCat').value,
        mrp: +g('pMrp').value, salePrice: +g('pSale').value,
        color: { name: g('pColorName').value, hex: g('pColorHex').value },
        description: g('pDesc').value,
        details: g('pDetails').value.split('\n').map((x) => x.trim()).filter(Boolean),
        fabric: g('pFabric').value.trim(), fit: g('pFit').value,
        care: g('pCare').value.split('\n').map((x) => x.trim()).filter(Boolean),
        stock: Object.fromEntries(['S', 'M', 'L', 'XL', 'XXL'].map((s) => [s, +g('st' + s).value])),
        flags: Object.fromEntries(['newArrival', 'bestseller', 'sale', 'featured'].map((k) => [k, g('fl_' + k).checked])),
        published: g('pPub').checked,
      };
      try {
        if (isNew) {
          const { product } = await api('/products', { method: 'POST', body: JSON.stringify({ name: body.name, sku: body.sku, category: body.category, mrp: body.mrp, salePrice: body.salePrice, colorName: body.color.name, colorHex: body.color.hex, description: body.description }) });
          await api(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api(`/products/${p.id}`, { method: 'PUT', body: JSON.stringify(body) });
        }
        toast('Saved'); closeModal(); go('products');
      } catch (e) { toast(e.message); }
    };
  }

  /* ══ ORDERS ══ */
  async function orders(el) {
    const { orders: O } = await api('/orders');
    el.innerHTML = `<h1>Orders</h1><div class="panel">
      ${O.length ? `<table><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Production</th><th></th></tr>
      ${O.map((o) => `<tr>
        <td><strong>${esc(o.orderId)}</strong></td><td>${dt(o.placedAt)}</td>
        <td>${esc(o.customer.name)}<div class="muted">${esc(o.customer.city)}</div></td>
        <td>${o.items.reduce((s, i) => s + i.qty, 0)}</td><td>${money(o.total)}</td>
        <td>${o.paymentMethod === 'cod' ? '<span class="tag">COD</span>' : (o.paymentStatus === 'Paid' ? '<span class="tag g">Paid</span>' : '<span class="tag r">Unpaid</span>')}</td>
        <td><span class="tag gold">${esc(o.status)}</span></td>
        <td class="muted">${esc(o.production.stage)}</td>
        <td><button class="btn sm ghost" data-o="${esc(o.orderId)}">Manage</button></td></tr>`).join('')}</table>`
      : '<p class="muted">No orders yet.</p>'}</div>`;
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => orderModal(O.find((x) => x.orderId === b.dataset.o)));
  }

  function orderModal(o) {
    const flow = o.paymentMethod === 'cod' ? COD_FLOW : ONLINE_FLOW;
    modal(`<h2>${esc(o.orderId)} <span class="tag gold">${esc(o.status)}</span></h2>
      <p class="muted">${dt(o.placedAt)} · ${o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'} · ${esc(o.paymentStatus)}${o.payment?.reference ? ' · Ref ' + esc(o.payment.reference) : ''}</p>
      <div class="grid2">
        <div class="panel" style="margin:0"><h2 style="font-size:16px">Customer</h2>
          <p style="margin:0;font-size:13px">${esc(o.customer.name)}<br>${esc(o.customer.phone)} · ${esc(o.customer.email)}<br>
          ${esc(o.customer.address)}<br>${esc(o.customer.city)}, ${esc(o.customer.state)} — ${esc(o.customer.pincode)}</p></div>
        <div class="panel" style="margin:0"><h2 style="font-size:16px">Items</h2>
          ${o.items.map((i) => `<div style="font-size:13px;margin-bottom:6px">${esc(i.name)} <span class="muted">(${i.size} × ${i.qty})</span> — ${money(i.price * i.qty)}</div>`).join('')}
          <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px;font-size:13px">
            Subtotal ${money(o.subtotal)}${o.discount?.amount ? ` · Coupon −${money(o.discount.amount)}` : ''} · Ship ${money(o.shippingFee)}${o.codCharge ? ` · COD ${money(o.codCharge)}` : ''}<br><strong>Total ${money(o.total)}</strong></div></div>
      </div>
      <div class="grid3" style="margin-top:14px">
        <div class="field"><label>Order status</label><select id="oStatus" style="width:100%">
          ${flow.map((s) => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn sm" style="margin-top:8px" id="setStatus">Update Status</button></div>
        <div class="field"><label>Production stage</label><select id="oProd" style="width:100%">
          ${PROD.map((s) => `<option ${o.production.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn sm" style="margin-top:8px" id="setProd">Update Production</button></div>
        <div class="field"><label>Shipping</label>
          <input id="oCourier" placeholder="Courier (e.g. Delhivery)" value="${esc(o.shipping.courier)}" style="width:100%;margin-bottom:6px">
          <input id="oAwb" placeholder="AWB / tracking no." value="${esc(o.shipping.awb)}" style="width:100%">
          <button class="btn sm" style="margin-top:8px" id="setShip">Save Shipping</button></div>
      </div>
      <div class="row" style="margin-top:8px">
        <a class="btn sm ghost" target="_blank" href="/api/admin/orders/${encodeURIComponent(o.orderId)}/invoice?token=x" id="invLink">Invoice</a>
        <span class="muted">Status history: ${o.statusHistory.map((h) => `${esc(h.status)} (${dt(h.at)})`).join(' → ')}</span>
      </div>`);
    document.getElementById('invLink').onclick = async (e) => {
      e.preventDefault();
      const r = await fetch(`/api/admin/orders/${encodeURIComponent(o.orderId)}/invoice`, { headers: { Authorization: 'Bearer ' + token } });
      const html = await r.text();
      const w = window.open('', '_blank'); w.document.write(html); w.document.close();
    };
    document.getElementById('setStatus').onclick = async () => {
      await api(`/orders/${o.orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: document.getElementById('oStatus').value }) });
      toast('Status updated'); closeModal(); go(view);
    };
    document.getElementById('setProd').onclick = async () => {
      await api(`/orders/${o.orderId}/production`, { method: 'PUT', body: JSON.stringify({ stage: document.getElementById('oProd').value }) });
      toast('Production updated'); closeModal(); go(view);
    };
    document.getElementById('setShip').onclick = async () => {
      await api(`/orders/${o.orderId}/shipping`, { method: 'PUT', body: JSON.stringify({ courier: document.getElementById('oCourier').value, awb: document.getElementById('oAwb').value }) });
      toast('Shipping saved'); closeModal(); go(view);
    };
  }

  /* ══ PRODUCTION ══ */
  async function production(el) {
    const { orders: O } = await api('/orders');
    const active = O.filter((o) => !['Delivered', 'Out for Delivery', 'Shipped'].includes(o.status));
    el.innerHTML = `<h1>Production Workflow</h1>
      <p class="muted" style="margin-top:-10px">Pieces are made/arranged after an order is received — move each order through the pipeline below.</p>
      ${PROD.map((stage) => {
        const list = active.filter((o) => o.production.stage === stage);
        return `<div class="panel"><h2>${stage} <span class="tag">${list.length}</span></h2>
          ${list.length ? `<table><tr><th>Order</th><th>Items</th><th>Placed</th><th></th></tr>
          ${list.map((o) => `<tr><td><strong>${esc(o.orderId)}</strong></td>
            <td>${o.items.map((i) => `${esc(i.name)} (${i.size}×${i.qty})`).join(', ')}</td>
            <td>${dt(o.placedAt)}</td>
            <td><button class="btn sm ghost" data-o="${esc(o.orderId)}">Manage</button></td></tr>`).join('')}</table>`
          : '<p class="muted">None in this stage.</p>'}</div>`;
      }).join('')}`;
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => orderModal(O.find((x) => x.orderId === b.dataset.o)));
  }

  /* ══ INVENTORY ══ */
  async function inventory(el) {
    const { products: P } = await api('/products');
    el.innerHTML = `<h1>Inventory</h1><div class="panel">
      <table><tr><th>Product</th>${['S', 'M', 'L', 'XL', 'XXL'].map((s) => `<th>${s}</th>`).join('')}<th>Total</th><th></th></tr>
      ${P.map((p) => `<tr><td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.sku)}</div></td>
        ${['S', 'M', 'L', 'XL', 'XXL'].map((s) => `<td><input data-p="${p.id}" data-s="${s}" type="number" min="0" value="${(p.stock || {})[s] || 0}" style="width:62px;text-align:center"></td>`).join('')}
        <td>${Object.values(p.stock || {}).reduce((a, b) => a + b, 0)}</td>
        <td><button class="btn sm" data-save="${p.id}">Save</button></td></tr>`).join('')}</table></div>`;
    el.querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.save;
      const stock = {};
      el.querySelectorAll(`input[data-p="${id}"]`).forEach((i) => stock[i.dataset.s] = +i.value);
      await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ stock }) });
      toast('Stock updated'); go('inventory');
    });
  }

  /* ══ CUSTOMERS ══ */
  async function customers(el) {
    const { customers: C } = await api('/customers');
    el.innerHTML = `<h1>Customers</h1><div class="panel">
      ${C.length ? `<table><tr><th>Name</th><th>Email</th><th>Phone</th><th>Since</th><th>Orders</th></tr>
      ${C.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td>
        <td>${dt(c.since)}</td><td>${c.orders.length} <span class="muted">(${c.orders.join(', ')})</span></td></tr>`).join('')}</table>`
      : '<p class="muted">No customers yet — they appear automatically with their first order.</p>'}</div>`;
  }

  /* ══ PAYMENTS ══ */
  async function payments(el) {
    const d = await api('/payments');
    el.innerHTML = `<h1>Payments</h1>
      <div class="panel"><p class="muted" style="margin:0">Gateway mode: <strong>${esc(d.gatewayMode)}</strong>. Secret keys stay in server environment variables; signatures are verified server-side.</p></div>
      <div class="panel">${d.payments.length ? `<table><tr><th>Order</th><th>Date</th><th>Method</th><th>Gateway</th><th>Reference</th><th>Status</th><th>Amount</th></tr>
      ${d.payments.map((p) => `<tr><td>${esc(p.orderId)}</td><td>${dt(p.at)}</td>
        <td>${p.method === 'cod' ? 'COD' : 'Online'}</td><td>${esc(p.gateway || '—')}</td><td>${esc(p.reference || '—')}</td>
        <td>${/Paid/.test(p.status) ? `<span class="tag g">${esc(p.status)}</span>` : `<span class="tag">${esc(p.status)}</span>`}</td>
        <td>${money(p.amount)}</td></tr>`).join('')}</table>` : '<p class="muted">No payments yet.</p>'}</div>`;
  }

  /* ══ SHIPPING ══ */
  async function shipping(el) {
    const [{ orders: O }, { settings: S }] = await Promise.all([api('/orders'), api('/settings')]);
    const toShip = O.filter((o) => ['Ready to Ship', 'Packed'].includes(o.status) || (o.production.stage === 'Ready to Ship' && !o.shipping.awb));
    el.innerHTML = `<h1>Shipping</h1>
      <div class="panel"><h2>Provider Configuration</h2>
        <p class="muted">A shipping aggregator (Shiprocket, Delhivery, etc.) can be plugged in server-side. API keys belong in environment variables (SHIPPING_API_KEY / SECRET) — never in this dashboard or client code.</p>
        <div class="row"><div class="field" style="margin:0"><label>Provider name</label><input id="shProv" value="${esc(S.shipping?.provider || '')}" placeholder="e.g. Shiprocket"></div>
        <div class="field" style="margin:0"><label>Flat rate (₹)</label><input id="shFlat" type="number" value="${S.shipping?.flatRate ?? 79}"></div>
        <div class="field" style="margin:0"><label>Free above (₹)</label><input id="shFree" type="number" value="${S.shipping?.freeAbove ?? 1999}"></div>
        <button class="btn sm" id="shSave" style="align-self:flex-end">Save</button></div></div>
      <div class="panel"><h2>Awaiting Dispatch (${toShip.length})</h2>
        ${toShip.length ? `<table><tr><th>Order</th><th>City / PIN</th><th>Courier</th><th>AWB</th><th></th></tr>
        ${toShip.map((o) => `<tr><td><strong>${esc(o.orderId)}</strong></td>
          <td>${esc(o.customer.city)} — ${esc(o.customer.pincode)}</td>
          <td>${esc(o.shipping.courier || '—')}</td><td>${esc(o.shipping.awb || '—')}</td>
          <td><button class="btn sm ghost" data-o="${esc(o.orderId)}">Assign / Manage</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Nothing waiting for dispatch.</p>'}</div>
      <div class="panel"><h2>Shipped &amp; In Transit</h2>
        ${O.filter((o) => ['Shipped', 'Out for Delivery'].includes(o.status)).map((o) =>
          `<div style="font-size:13px;margin-bottom:6px"><strong>${esc(o.orderId)}</strong> · ${esc(o.shipping.courier || '—')} · AWB ${esc(o.shipping.awb || '—')} · <span class="tag gold">${esc(o.status)}</span></div>`).join('') || '<p class="muted">None in transit.</p>'}</div>`;
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => orderModal(O.find((x) => x.orderId === b.dataset.o)));
    el.querySelector('#shSave').onclick = async () => {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ shipping: { provider: shProv.value, flatRate: +shFlat.value, freeAbove: +shFree.value } }) });
      toast('Shipping settings saved');
    };
  }

  /* ══ DISCOUNTS ══ */
  async function discounts(el) {
    const { discounts: D } = await api('/discounts');
    el.innerHTML = `<h1>Discounts</h1>
      <div class="panel"><h2>Create Coupon</h2><div class="row">
        <div class="field" style="margin:0"><label>Code</label><input id="dCode" placeholder="WELCOME10" style="text-transform:uppercase"></div>
        <div class="field" style="margin:0"><label>Type</label><select id="dType"><option value="percent">% off</option><option value="flat">₹ flat off</option></select></div>
        <div class="field" style="margin:0"><label>Value</label><input id="dVal" type="number" min="0"></div>
        <div class="field" style="margin:0"><label>Min subtotal (₹)</label><input id="dMin" type="number" min="0" value="0"></div>
        <div class="field" style="margin:0"><label>Max discount (₹, 0 = none)</label><input id="dMax" type="number" min="0" value="0"></div>
        <button class="btn sm" id="dAdd" style="align-self:flex-end">Create</button></div></div>
      <div class="panel">${D.length ? `<table><tr><th>Code</th><th>Type</th><th>Value</th><th>Min</th><th>Cap</th><th>Status</th><th></th></tr>
      ${D.map((d) => `<tr><td><strong>${esc(d.code)}</strong></td><td>${d.type}</td><td>${d.type === 'percent' ? d.value + '%' : money(d.value)}</td>
        <td>${d.minSubtotal ? money(d.minSubtotal) : '—'}</td><td>${d.maxDiscount ? money(d.maxDiscount) : '—'}</td>
        <td>${d.active ? '<span class="tag g">Active</span>' : '<span class="tag r">Off</span>'}</td>
        <td><button class="btn sm ghost" data-t="${d.id}">${d.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn sm danger" data-x="${d.id}">Delete</button></td></tr>`).join('')}</table>`
      : '<p class="muted">No coupons yet.</p>'}</div>`;
    el.querySelector('#dAdd').onclick = async () => {
      try {
        await api('/discounts', { method: 'POST', body: JSON.stringify({ code: dCode.value, type: dType.value, value: +dVal.value, minSubtotal: +dMin.value, maxDiscount: +dMax.value }) });
        toast('Coupon created'); go('discounts');
      } catch (e) { toast(e.message); }
    };
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = async () => {
      const d = D.find((x) => x.id === b.dataset.t);
      await api(`/discounts/${d.id}`, { method: 'PUT', body: JSON.stringify({ active: !d.active }) });
      go('discounts');
    });
    el.querySelectorAll('[data-x]').forEach((b) => b.onclick = async () => {
      await api(`/discounts/${b.dataset.x}`, { method: 'DELETE' }); go('discounts');
    });
  }

  /* ══ REVIEWS ══ */
  async function reviews(el) {
    const { reviews: R } = await api('/reviews');
    el.innerHTML = `<h1>Reviews</h1>
      <div class="panel"><p class="muted" style="margin:0">Genuine customer reviews collected after delivery appear here for moderation. No sample/demo reviews are shown on the storefront.</p></div>
      <div class="panel">${R.length ? `<table><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Status</th><th></th></tr>
      ${R.map((r) => `<tr><td>${esc(r.productId)}</td><td>${esc(r.name)}</td><td>${'★'.repeat(r.rating)}</td>
        <td>${esc(r.text)}</td><td>${r.approved ? '<span class="tag g">Live</span>' : '<span class="tag">Pending</span>'}</td>
        <td><button class="btn sm ghost" data-a="${r.id}">${r.approved ? 'Unpublish' : 'Approve'}</button></td></tr>`).join('')}</table>`
      : '<p class="muted">No reviews submitted yet.</p>'}</div>`;
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
      const r = R.find((x) => x.id === b.dataset.a);
      await api(`/reviews/${r.id}`, { method: 'PUT', body: JSON.stringify({ approved: !r.approved }) });
      go('reviews');
    });
  }

  /* ══ MESSAGES ══ */
  async function messages(el) {
    const { messages: M } = await api('/messages');
    el.innerHTML = `<h1>Messages</h1><div class="panel">
      ${M.length ? M.map((m) => `<div style="border-bottom:1px solid var(--line);padding:12px 0">
        <strong>${esc(m.name)}</strong> <span class="muted">&lt;${esc(m.email)}&gt; · ${dt(m.at)}</span>
        <p style="margin:6px 0 0;font-size:13.5px">${esc(m.message)}</p></div>`).join('')
      : '<p class="muted">No messages from the contact page yet.</p>'}</div>`;
  }

  /* ══ SETTINGS ══ */
  async function settings(el) {
    const { settings: S } = await api('/settings');
    el.innerHTML = `<h1>Store Settings</h1>
      <div class="panel"><h2>Storefront</h2>
        <div class="field"><label>Announcement bar</label><input id="sAnn" style="width:100%" value="${esc(S.store?.announcement || '')}"></div></div>
      <div class="panel"><h2>Shipping &amp; COD</h2><div class="row">
        <div class="field" style="margin:0"><label>Flat rate (₹)</label><input id="sFlat" type="number" value="${S.shipping?.flatRate ?? 79}"></div>
        <div class="field" style="margin:0"><label>Free shipping above (₹)</label><input id="sFree" type="number" value="${S.shipping?.freeAbove ?? 1999}"></div>
        <div class="field" style="margin:0"><label>COD charge (₹)</label><input id="sCodC" type="number" value="${S.shipping?.codCharge ?? 0}"></div>
        <label style="display:flex;gap:6px;align-items:center;align-self:flex-end"><input type="checkbox" id="sCod" ${S.shipping?.codEnabled !== false ? 'checked' : ''}> COD enabled</label>
      </div></div>
      <div class="panel"><h2>Tax / GST</h2>
        <p class="muted">Leave disabled until the brand's GST registration details are available — nothing is invented on invoices.</p>
        <div class="row">
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="sTaxOn" ${S.tax?.enabled ? 'checked' : ''}> Enabled</label>
        <div class="field" style="margin:0"><label>Label</label><input id="sTaxLabel" value="${esc(S.tax?.label || 'GST')}" style="width:90px"></div>
        <div class="field" style="margin:0"><label>GSTIN</label><input id="sGstin" value="${esc(S.tax?.gstin || '')}" placeholder="Not set"></div>
        <div class="field" style="margin:0"><label>Rate %</label><input id="sTaxRate" type="number" min="0" max="28" value="${S.tax?.ratePct || 0}" style="width:90px"></div>
      </div></div>
      <div class="panel"><h2>Payments</h2>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="sOnline" ${S.payments?.onlineEnabled !== false ? 'checked' : ''}> Online payments enabled</label>
        <p class="muted">Gateway keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are configured via server environment variables only.</p></div>
      <div class="panel"><h2>Invoice</h2>
        <div class="field"><label>Registered address (shown on invoice)</label><input id="sInvAddr" style="width:100%" value="${esc(S.invoice?.address || '')}" placeholder="Not set"></div>
        <div class="field"><label>Footer note</label><input id="sInvFoot" style="width:100%" value="${esc(S.invoice?.footerNote || '')}"></div></div>
      <button class="btn" id="sSave">Save All Settings</button>`;
    el.querySelector('#sSave').onclick = async () => {
      await api('/settings', {
        method: 'PUT', body: JSON.stringify({
          store: { announcement: sAnn.value },
          shipping: { flatRate: +sFlat.value, freeAbove: +sFree.value, codCharge: +sCodC.value, codEnabled: sCod.checked },
          tax: { enabled: sTaxOn.checked, label: sTaxLabel.value, gstin: sGstin.value, ratePct: +sTaxRate.value },
          payments: { onlineEnabled: sOnline.checked },
          invoice: { address: sInvAddr.value, footerNote: sInvFoot.value },
        }),
      });
      toast('Settings saved');
    };
  }

  /* boot */
  if (token) { renderShell(); go('dashboard'); } else renderLogin();
})();
