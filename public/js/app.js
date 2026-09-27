/* SANJHH BY AM — shared storefront runtime */
(function () {
  'use strict';

  const CATEGORY_LABELS = {
    'dresses': 'Dresses',
    'jumpsuits': 'Jumpsuits',
    'coord-sets': 'Co-ord Sets',
    'ethnic-occasion': 'Ethnic & Occasion',
  };

  const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── local storage helpers ── */
  const store = {
    get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };

  const SBAM = {
    products: [], settings: null, money, esc, CATEGORY_LABELS,
    _ready: [], _loaded: false,

    async init() {
      renderChrome();
      bindChrome();
      try {
        const [pr, sr] = await Promise.all([
          fetch('/api/products').then((r) => r.json()),
          fetch('/api/settings/public').then((r) => r.json()),
        ]);
        this.products = pr.products || [];
        this.settings = sr;
        const bar = document.getElementById('announceBar');
        if (bar && sr.announcement) bar.textContent = sr.announcement;
      } catch (e) { console.error('Failed to load catalogue', e); }
      this._loaded = true;
      this._ready.forEach((fn) => fn());
      updateBadges();
      observeReveals();
    },
    ready(fn) { this._loaded ? fn() : this._ready.push(fn); },
    byId(id) { return this.products.find((p) => p.id === id); },
    bySlug(slug) { return this.products.find((p) => p.slug === slug); },

    /* ── cart ── */
    cart() { return store.get('sbam_cart', []); },
    saveCart(c) { store.set('sbam_cart', c); updateBadges(); },
    addToCart(productId, size, qty = 1, open = true) {
      const p = this.byId(productId);
      if (!p) return;
      const c = this.cart();
      const line = c.find((l) => l.productId === productId && l.size === size);
      const stock = (p.stock && p.stock[size]) || 0;
      if (line) line.qty = Math.min(line.qty + qty, 10, stock);
      else c.push({ productId, size, qty: Math.min(qty, stock) });
      this.saveCart(c);
      renderCartDrawer();
      if (open) openDrawer();
      else toast('Added to bag');
    },
    cartCount() { return this.cart().reduce((s, l) => s + l.qty, 0); },
    cartSubtotal() {
      return this.cart().reduce((s, l) => {
        const p = this.byId(l.productId); return s + (p ? p.salePrice * l.qty : 0);
      }, 0);
    },

    /* ── wishlist ── */
    wishlist() { return store.get('sbam_wishlist', []); },
    toggleWish(id) {
      let w = this.wishlist();
      const on = w.includes(id);
      w = on ? w.filter((x) => x !== id) : [...w, id];
      store.set('sbam_wishlist', w);
      updateBadges();
      toast(on ? 'Removed from wishlist' : 'Saved to wishlist');
      return !on;
    },

    toast, openDrawer, renderCartDrawer, productCard, openSizeGuide,
  };
  window.SBAM = SBAM;

  /* ══ icons ══ */
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.6 3.2 4.2 6.8-1.8 4.5-9.3 9.2-9.3 9.2z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.6 3.2 4.2 6.8-1.8 4.5-9.3 9.2-9.3 9.2z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.6-3.3 4.6-5 8-5s6.4 1.7 8 5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };

  const NAV_LINKS = [
    ['shop.html?tag=new', 'New Arrivals'],
    ['shop.html?cat=dresses', 'Dresses'],
    ['shop.html?cat=jumpsuits', 'Jumpsuits'],
    ['shop.html?cat=coord-sets', 'Co-ord Sets'],
    ['shop.html?cat=ethnic-occasion', 'Ethnic & Occasion'],
    ['shop.html?tag=bestseller', 'Best Sellers'],
    ['shop.html?tag=sale', 'Sale'],
  ];

  /* ══ chrome (header / footer / drawers) ══ */
  function renderChrome() {
    const header = document.getElementById('siteChrome');
    if (!header) return;
    header.innerHTML = `
      <div class="announce" id="announceBar">NEW SEASON — DISCOVER SANJHH BY AM</div>
      <header class="site-header">
        <div class="container header-inner">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${I.menu}</button>
            <nav class="main-nav" aria-label="Main">
              ${NAV_LINKS.map(([h, t]) => `<a href="${h}" class="${t === 'Sale' ? 'sale-link' : ''}">${t}</a>`).join('')}
            </nav>
          </div>
          <div class="logo"><a href="index.html" aria-label="SANJHH BY AM home">
            <span class="name">SANJHH</span><span class="by">— BY AM —</span>
          </a></div>
          <div class="header-icons">
            <button class="icon-btn" id="searchBtn" aria-label="Search">${I.search}</button>
            <a class="icon-btn" href="wishlist.html" aria-label="Wishlist">${I.heart}<span class="badge-count" id="wishBadge"></span></a>
            <a class="icon-btn" href="account.html" aria-label="Account">${I.user}</a>
            <button class="icon-btn" id="cartBtn" aria-label="Shopping bag">${I.bag}<span class="badge-count" id="cartBadge"></span></button>
          </div>
        </div>
      </header>
      <div class="mobile-nav" id="mobileNav">
        <div class="scrim" data-close></div>
        <div class="panel">
          <div class="brand">SANJHH <span style="font-size:11px;letter-spacing:3px">BY AM</span></div>
          ${NAV_LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
          <a href="track-order.html">Track Order</a>
          <a href="about.html">Our Story</a>
        </div>
      </div>
      <div class="search-overlay" id="searchOverlay">
        <div class="search-box">
          <div class="close-row"><button data-close aria-label="Close search">×</button></div>
          <input class="search-input" id="searchInput" placeholder="Search dresses, jumpsuits, co-ords…" autocomplete="off">
          <div class="search-hint" id="searchHint">Start typing to search the collection</div>
        </div>
        <div class="search-results" id="searchResults"></div>
      </div>
      <div class="drawer-wrap" id="cartDrawer">
        <div class="scrim" data-close></div>
        <aside class="drawer" aria-label="Shopping bag">
          <div class="drawer-head"><span>Your Bag</span><button data-close aria-label="Close">×</button></div>
          <div class="drawer-body" id="drawerBody"></div>
          <div class="drawer-foot" id="drawerFoot"></div>
        </aside>
      </div>
      <div class="modal-wrap" id="modalWrap">
        <div class="scrim" data-close></div>
        <div class="modal" id="modalBox"></div>
      </div>
      <div class="toast" id="toast"></div>`;

    const footer = document.getElementById('siteFooter');
    if (footer) {
      footer.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="fbrand">SANJHH</div><div class="fby">— BY AM —</div>
              <p>Contemporary women's fashion made for brighter days. Timeless pieces, thoughtful details, effortless style.</p>
            </div>
            <div>
              <h4>Shop</h4>
              <ul>
                <li><a href="shop.html?tag=new">New Arrivals</a></li>
                <li><a href="shop.html?cat=dresses">Dresses</a></li>
                <li><a href="shop.html?cat=jumpsuits">Jumpsuits</a></li>
                <li><a href="shop.html?cat=coord-sets">Co-ord Sets</a></li>
                <li><a href="shop.html?cat=ethnic-occasion">Ethnic &amp; Occasion</a></li>
                <li><a href="shop.html?tag=sale">Sale</a></li>
              </ul>
            </div>
            <div>
              <h4>Help</h4>
              <ul>
                <li><a href="track-order.html">Track Your Order</a></li>
                <li><a href="shipping-returns.html">Shipping &amp; Returns</a></li>
                <li><a href="contact.html">Contact Us</a></li>
                <li><a href="account.html">My Account</a></li>
                <li><a href="wishlist.html">Wishlist</a></li>
              </ul>
            </div>
            <div>
              <h4>About</h4>
              <ul>
                <li><a href="about.html">Our Story</a></li>
                <li><a href="privacy.html">Privacy Policy</a></li>
                <li><a href="terms.html">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${new Date().getFullYear()} SANJHH BY AM. All rights reserved.</span>
            <span>Made for brighter days ♡</span>
          </div>
        </div>
      </footer>`;
    }
  }

  function bindChrome() {
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        document.querySelectorAll('.drawer-wrap.open, .mobile-nav.open, .search-overlay.open, .modal-wrap.open')
          .forEach((el) => el.classList.remove('open'));
      }
    });
    document.getElementById('menuBtn')?.addEventListener('click', () =>
      document.getElementById('mobileNav').classList.add('open'));
    document.getElementById('cartBtn')?.addEventListener('click', () => { renderCartDrawer(); openDrawer(); });
    document.getElementById('searchBtn')?.addEventListener('click', () => {
      document.getElementById('searchOverlay').classList.add('open');
      setTimeout(() => document.getElementById('searchInput').focus(), 50);
    });
    document.getElementById('searchInput')?.addEventListener('input', onSearch);
    document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) location.href = 'shop.html?q=' + encodeURIComponent(q);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.drawer-wrap.open, .mobile-nav.open, .search-overlay.open, .modal-wrap.open')
        .forEach((el) => el.classList.remove('open'));
    });
  }

  function onSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    const box = document.getElementById('searchResults');
    const hint = document.getElementById('searchHint');
    if (q.length < 2) { box.innerHTML = ''; hint.textContent = 'Start typing to search the collection'; return; }
    const hits = SBAM.products.filter((p) =>
      [p.name, p.category, p.color?.name, ...(p.tags || [])].join(' ').toLowerCase().includes(q)).slice(0, 6);
    hint.textContent = hits.length ? `${hits.length} result${hits.length > 1 ? 's' : ''} — press Enter to see all` : 'No pieces found — try “dress”, “co-ord”, “stripe”…';
    box.innerHTML = hits.map((p) => productCard(p, { compact: true })).join('');
  }

  /* ══ badges ══ */
  function updateBadges() {
    const cb = document.getElementById('cartBadge');
    const wb = document.getElementById('wishBadge');
    const cc = SBAM.cartCount(); const wc = SBAM.wishlist().length;
    if (cb) { cb.textContent = cc; cb.classList.toggle('show', cc > 0); }
    if (wb) { wb.textContent = wc; wb.classList.toggle('show', wc > 0); }
  }

  /* ══ toast ══ */
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ══ cart drawer ══ */
  function openDrawer() { document.getElementById('cartDrawer').classList.add('open'); }

  function renderCartDrawer() {
    const body = document.getElementById('drawerBody');
    const foot = document.getElementById('drawerFoot');
    if (!body) return;
    const cart = SBAM.cart();
    if (!cart.length) {
      body.innerHTML = `<div class="empty-state"><div class="big">Your bag is empty</div>
        <p>Discover pieces made for brighter days.</p>
        <a class="btn sm" href="shop.html">Shop the collection</a></div>`;
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = cart.map((l, i) => {
      const p = SBAM.byId(l.productId);
      if (!p) return '';
      return `<div class="cart-line">
        <a href="product.html?p=${p.slug}"><img src="${p.images[0]?.src}" alt="${esc(p.images[0]?.alt || p.name)}" loading="lazy"></a>
        <div>
          <div class="n"><a href="product.html?p=${p.slug}">${esc(p.name)}</a></div>
          <div class="meta">Size ${l.size} · ${esc(p.color?.name || '')}</div>
          <div class="p">${money(p.salePrice)} <span class="mrp">${money(p.mrp)}</span></div>
          <div class="qty-mini">
            <button data-qty="-1" data-i="${i}" aria-label="Decrease">−</button><span>${l.qty}</span>
            <button data-qty="1" data-i="${i}" aria-label="Increase">+</button>
          </div>
        </div>
        <button class="rm" data-rm="${i}">Remove</button>
      </div>`;
    }).join('');
    const sub = SBAM.cartSubtotal();
    const free = SBAM.settings?.shipping?.freeAbove ?? 1999;
    foot.innerHTML = `
      <div class="subtotal-row"><span>Subtotal</span><strong>${money(sub)}</strong></div>
      <div class="ship-note">${sub >= free ? 'You’ve unlocked free shipping ✦' : `Add ${money(free - sub)} more for free shipping`}. Taxes calculated at checkout.</div>
      <a class="btn ghost block" href="cart.html">View Bag</a>
      <a class="btn block" href="checkout.html">Checkout</a>`;
    body.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => {
      const c = SBAM.cart(); const i = +b.dataset.i;
      const p = SBAM.byId(c[i].productId);
      const max = Math.min(10, (p.stock && p.stock[c[i].size]) || 10);
      c[i].qty = Math.max(1, Math.min(max, c[i].qty + (+b.dataset.qty)));
      SBAM.saveCart(c); renderCartDrawer();
      if (window.renderCartPage) window.renderCartPage();
    }));
    body.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      const c = SBAM.cart(); c.splice(+b.dataset.rm, 1);
      SBAM.saveCart(c); renderCartDrawer();
      if (window.renderCartPage) window.renderCartPage();
    }));
  }

  /* ══ product card ══ */
  function productCard(p, opts = {}) {
    const wished = SBAM.wishlist().includes(p.id);
    const img0 = p.images[0]; const img1 = p.images[1];
    const badges = [];
    if (p.flags?.newArrival) badges.push('<span class="badge">New</span>');
    if (p.discountPct > 0) badges.push(`<span class="badge sale">−${p.discountPct}%</span>`);
    const soldOut = Object.values(p.stock || {}).every((q) => !q);
    return `<article class="card" data-pid="${p.id}">
      <div class="media">
        <div class="badges">${badges.join('')}</div>
        <button class="wish ${wished ? 'on' : ''}" data-wish="${p.id}" aria-label="Add to wishlist">${wished ? I.heartFill : I.heart}</button>
        <a href="product.html?p=${p.slug}">
          <img class="main" src="${img0?.src}" alt="${esc(img0?.alt || p.name)}" loading="lazy">
          ${img1 && !opts.compact ? `<img class="alt" src="${img1.src}" alt="${esc(img1.alt || p.name)}" loading="lazy">` : ''}
        </a>
        ${opts.compact ? '' : `<button class="quick" data-quick="${p.id}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold Out' : 'Quick Add'}</button>`}
      </div>
      <div class="info">
        <div class="name"><a href="product.html?p=${p.slug}">${esc(p.name)}</a></div>
        <div class="prices">
          <span class="price">${money(p.salePrice)}</span>
          ${p.mrp > p.salePrice ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${p.discountPct}% OFF</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  /* card interactions (delegated) */
  document.addEventListener('click', (e) => {
    const wishBtn = e.target.closest('[data-wish]');
    if (wishBtn) {
      e.preventDefault();
      const on = SBAM.toggleWish(wishBtn.dataset.wish);
      wishBtn.classList.toggle('on', on);
      wishBtn.innerHTML = on ? I.heartFill : I.heart;
      if (window.renderWishlistPage) window.renderWishlistPage();
      return;
    }
    const quickBtn = e.target.closest('[data-quick]');
    if (quickBtn) {
      e.preventDefault();
      showSizePop(quickBtn);
    }
  });

  function showSizePop(btn) {
    document.querySelectorAll('.size-pop').forEach((el) => el.remove());
    const p = SBAM.byId(btn.dataset.quick);
    if (!p) return;
    const pop = document.createElement('div');
    pop.className = 'size-pop';
    pop.innerHTML = `<div class="t">Select size</div><div class="sizes">
      ${p.sizes.map((s) => `<button data-s="${s}" ${((p.stock && p.stock[s]) || 0) <= 0 ? 'disabled' : ''}>${s}</button>`).join('')}
    </div>`;
    btn.closest('.media').appendChild(pop);
    pop.querySelectorAll('button[data-s]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.preventDefault();
      SBAM.addToCart(p.id, b.dataset.s, 1, true);
      pop.remove();
    }));
    setTimeout(() => document.addEventListener('click', function h(ev) {
      if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', h); }
    }), 10);
  }

  /* ══ size guide modal ══ */
  function openSizeGuide() {
    const wrap = document.getElementById('modalWrap');
    document.getElementById('modalBox').innerHTML = `
      <button class="x" data-close aria-label="Close">×</button>
      <h3>Size Guide</h3>
      <p style="color:var(--taupe);font-size:13px">Indicative body measurements in inches. Between sizes? We suggest sizing up for a relaxed fit.</p>
      <table class="size-table">
        <tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr>
        <tr><td>S</td><td>34</td><td>28</td><td>37</td></tr>
        <tr><td>M</td><td>36</td><td>30</td><td>39</td></tr>
        <tr><td>L</td><td>38</td><td>32</td><td>41</td></tr>
        <tr><td>XL</td><td>40</td><td>34</td><td>43</td></tr>
        <tr><td>XXL</td><td>42</td><td>36</td><td>45</td></tr>
      </table>`;
    wrap.classList.add('open');
  }

  /* ══ scroll reveal ══ */
  function observeReveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }

  document.addEventListener('DOMContentLoaded', () => SBAM.init());
})();
