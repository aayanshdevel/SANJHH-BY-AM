/* Checkout: summary, coupon, order placement, payment flows (demo / Razorpay / COD) */
(function () {
  const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman & Nicobar Islands','Chandigarh','Dadra & Nagar Haveli and Daman & Diu','Lakshadweep'];
  let coupon = null;
  const money = SBAM.money;

  SBAM.ready(() => {
    if (!SBAM.cart().length) {
      document.querySelector('.checkout-layout').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1"><div class="big">Your bag is empty</div>
        <p>Add something beautiful before checking out.</p><a class="btn sm" href="shop.html">Shop the Collection</a></div>`;
      return;
    }
    const sel = document.getElementById('f-state');
    STATES.forEach((s) => sel.add(new Option(s, s)));
    sel.value = 'Madhya Pradesh';

    /* prefill saved details */
    try {
      const saved = JSON.parse(localStorage.getItem('sbam_customer') || 'null');
      if (saved) ['name', 'phone', 'email', 'address', 'city', 'state', 'pincode'].forEach((k) => {
        const el = document.getElementById('f-' + (k === 'pincode' ? 'pin' : k));
        if (el && saved[k]) el.value = saved[k];
      });
    } catch {}

    const cod = SBAM.settings?.shipping?.codEnabled !== false;
    if (!cod) document.getElementById('optCod').style.display = 'none';
    if (SBAM.settings?.payments?.mode === 'demo') {
      document.getElementById('onlineDesc').textContent =
        'UPI, cards, netbanking & wallets. (Demo mode — payment is simulated until gateway keys are configured.)';
    }
    const codCharge = SBAM.settings?.shipping?.codCharge ?? 0;
    if (codCharge) document.getElementById('codDesc').textContent = `Pay in cash when your order arrives (₹${codCharge} COD handling).`;

    renderSummary();

    document.querySelectorAll('.pay-opt input').forEach((r) => r.addEventListener('change', () => {
      document.querySelectorAll('.pay-opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked));
      renderSummary();
    }));

    document.getElementById('couponBtn').addEventListener('click', applyCoupon);
    document.getElementById('checkoutForm').addEventListener('submit', placeOrder);
  });

  function totals() {
    const sub = SBAM.cartSubtotal();
    const disc = coupon ? coupon.amount : 0;
    const s = SBAM.settings?.shipping || {};
    const ship = (sub - disc) >= (s.freeAbove ?? 1999) ? 0 : (s.flatRate ?? 79);
    const isCod = document.querySelector('input[name=pay]:checked')?.value === 'cod';
    const codc = isCod ? (s.codCharge ?? 0) : 0;
    return { sub, disc, ship, codc, total: sub - disc + ship + codc };
  }

  function renderSummary() {
    const items = document.getElementById('summaryItems');
    items.innerHTML = SBAM.cart().map((l) => {
      const p = SBAM.byId(l.productId); if (!p) return '';
      return `<div class="mini-item">
        <img src="${p.images[0].src}" alt="${SBAM.esc(p.images[0].alt)}">
        <div style="flex:1"><div>${SBAM.esc(p.name)}</div>
        <div class="m">Size ${l.size} × ${l.qty}</div></div>
        <div>${money(p.salePrice * l.qty)}</div>
      </div>`;
    }).join('');
    const t = totals();
    document.getElementById('summaryTotals').innerHTML = `
      <div class="summary-line"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      ${t.disc ? `<div class="summary-line" style="color:var(--rose)"><span>Coupon (${SBAM.esc(coupon.code)})</span><span>− ${money(t.disc)}</span></div>` : ''}
      <div class="summary-line"><span>Shipping</span><span>${t.ship ? money(t.ship) : 'Free'}</span></div>
      ${t.codc ? `<div class="summary-line"><span>COD charge</span><span>${money(t.codc)}</span></div>` : ''}
      <div class="summary-line total"><span>Total</span><span>${money(t.total)}</span></div>`;
  }

  async function applyCoupon() {
    const code = document.getElementById('couponInput').value.trim();
    const msg = document.getElementById('couponMsg');
    if (!code) { coupon = null; msg.textContent = ''; renderSummary(); return; }
    try {
      const r = await fetch('/api/discounts/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: SBAM.cartSubtotal() }),
      }).then((x) => x.json());
      if (r.valid) {
        coupon = r;
        msg.style.color = 'var(--gold)'; msg.textContent = `Coupon applied — you save ${money(r.amount)}`;
      } else {
        coupon = null;
        msg.style.color = 'var(--rose)'; msg.textContent = r.reason || 'Invalid or expired code';
      }
    } catch { msg.textContent = 'Could not validate coupon.'; }
    renderSummary();
  }

  function fail(text) {
    const el = document.getElementById('formError');
    el.style.display = 'block'; el.textContent = text;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const btn = document.getElementById('placeBtn');
    btn.disabled = false; btn.textContent = 'Place Order';
  }

  async function placeOrder(e) {
    e.preventDefault();
    document.getElementById('formError').style.display = 'none';
    const v = (id) => document.getElementById(id).value.trim();
    const customer = {
      name: v('f-name'), phone: v('f-phone'), email: v('f-email'),
      address: v('f-address'), city: v('f-city'), state: v('f-state'), pincode: v('f-pin'),
    };
    if (customer.name.length < 2) return fail('Please enter your full name.');
    if (!/^[6-9]\d{9}$/.test(customer.phone)) return fail('Please enter a valid 10-digit mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return fail('Please enter a valid email address.');
    if (customer.address.length < 8) return fail('Please enter your complete delivery address.');
    if (!customer.city || !customer.state) return fail('Please enter your city and select your state.');
    if (!/^[1-9]\d{5}$/.test(customer.pincode)) return fail('Please enter a valid 6-digit PIN code.');

    localStorage.setItem('sbam_customer', JSON.stringify(customer));
    const paymentMethod = document.querySelector('input[name=pay]:checked').value;
    const btn = document.getElementById('placeBtn');
    btn.disabled = true; btn.textContent = 'Placing order…';

    let res;
    try {
      res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer, paymentMethod,
          discountCode: coupon?.code || '',
          items: SBAM.cart().map((l) => ({ productId: l.productId, size: l.size, qty: l.qty })),
        }),
      });
    } catch { return fail('Network error — please try again.'); }
    const data = await res.json();
    if (!res.ok) return fail(data.error || 'Could not place the order.');

    if (data.paymentMode === 'cod') return success(data);

    if (data.paymentMode === 'demo') {
      btn.textContent = 'Confirming payment…';
      const ok = await demoPaymentModal(data);
      if (!ok) return fail('Payment was cancelled. Your order is saved — you can retry from Track Order.');
      const conf = await fetch('/api/payments/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId, accessKey: data.accessKey }),
      }).then((r) => r.json());
      if (!conf.ok) return fail(conf.error || 'Payment confirmation failed.');
      return success(data);
    }

    /* live Razorpay flow */
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const rzp = new Razorpay({
      key: data.razorpayKeyId,
      amount: data.total * 100, currency: 'INR',
      name: 'SANJHH BY AM', description: `Order ${data.orderId}`,
      prefill: { name: customer.name, email: customer.email, contact: customer.phone },
      theme: { color: '#211d17' },
      handler: async (resp) => {
        const conf = await fetch('/api/payments/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.orderId, accessKey: data.accessKey, ...resp }),
        }).then((r) => r.json());
        if (conf.ok) success(data);
        else fail(conf.error || 'Payment verification failed.');
      },
      modal: { ondismiss: () => fail('Payment was cancelled. Your order is saved — you can retry from Track Order.') },
    });
    rzp.open();
  }

  function demoPaymentModal(data) {
    return new Promise((resolve) => {
      const wrap = document.getElementById('modalWrap');
      document.getElementById('modalBox').innerHTML = `
        <h3>Demo Payment</h3>
        <p style="color:var(--taupe);font-size:13.5px">The payment gateway is running in <strong>demo mode</strong> (no Razorpay keys configured yet). This simulates a successful online payment of <strong>${money(data.total)}</strong> for order <strong>${data.orderId}</strong>.</p>
        <button class="btn block" id="demoPayBtn">Simulate Successful Payment</button>
        <button class="btn ghost block" id="demoCancelBtn" style="margin-top:10px">Cancel</button>`;
      wrap.classList.add('open');
      document.getElementById('demoPayBtn').onclick = () => { wrap.classList.remove('open'); resolve(true); };
      document.getElementById('demoCancelBtn').onclick = () => { wrap.classList.remove('open'); resolve(false); };
    });
  }

  function success(data) {
    SBAM.saveCart([]);
    try {
      const arr = JSON.parse(localStorage.getItem('sbam_orders') || '[]');
      arr.push({ id: data.orderId, key: data.accessKey, at: Date.now() });
      localStorage.setItem('sbam_orders', JSON.stringify(arr));
    } catch {}
    location.href = `order-success.html?id=${encodeURIComponent(data.orderId)}&key=${encodeURIComponent(data.accessKey)}`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
})();
