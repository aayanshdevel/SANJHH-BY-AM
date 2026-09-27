/* Product detail page */
(function () {
  const slug = new URLSearchParams(location.search).get('p');
  let product = null, reviews = [], selSize = '', qty = 1, imgIdx = 0;

  SBAM.ready(async () => {
    product = SBAM.bySlug(slug);
    if (!product) {
      document.getElementById('pdp').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="big">We couldn't find that piece</div>
          <p>It may have been moved or is no longer available.</p>
          <a class="btn sm" href="shop.html">Browse the Collection</a>
        </div>`;
      return;
    }
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(slug)}`).then((r) => r.json());
      reviews = res.reviews || [];
    } catch {}
    render();
    renderReviews();
    renderRelated();
    injectSEO();
  });

  const money = SBAM.money, esc = SBAM.esc;

  function render() {
    const p = product;
    document.title = `${p.name} — Buy Online | SANJHH BY AM`;
    document.querySelector('meta[name=description]').content =
      `${p.name} — ${p.description.slice(0, 140)} Shop at SANJHH BY AM.`;
    document.getElementById('crumbs').innerHTML =
      `<a href="index.html">Home</a> &nbsp;/&nbsp; <a href="shop.html?cat=${p.category}">${SBAM.CATEGORY_LABELS[p.category] || 'Shop'}</a> &nbsp;/&nbsp; ${esc(p.name)}`;

    const soldOut = Object.values(p.stock || {}).every((q) => !q);
    const isSheet = (src) => /details|collage/.test(src);

    document.getElementById('pdp').innerHTML = `
      <div class="gallery">
        <div class="thumbs" id="thumbs">
          ${p.images.map((im, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}" aria-label="View image ${i + 1}">
            <img src="${im.src}" alt="${esc(im.alt)}" loading="lazy"></button>`).join('')}
        </div>
        <div class="main-img"><img id="mainImg" src="${p.images[0].src}" alt="${esc(p.images[0].alt)}"></div>
      </div>
      <div class="pinfo">
        <span class="kicker">${SBAM.CATEGORY_LABELS[p.category] || ''}</span>
        <h1 style="margin-top:8px">${esc(p.name)}</h1>
        <div class="sku">SKU ${esc(p.sku)}</div>
        <div class="prices">
          <span class="price">${money(p.salePrice)}</span>
          ${p.mrp > p.salePrice ? `<span class="mrp">MRP ${money(p.mrp)}</span><span class="off">${p.discountPct}% OFF</span>` : ''}
        </div>
        <div class="tax-note">MRP inclusive of all taxes</div>
        <div class="divider"></div>
        <div style="margin-bottom:18px">
          <div class="opt-label">Colour</div>
          <span class="color-chip"><span class="swatch" style="background:${p.color?.hex};width:18px;height:18px"></span>${esc(p.color?.name || '')}</span>
        </div>
        <div style="margin-bottom:18px">
          <div class="opt-label"><span>Size</span><span class="guide" id="sizeGuideBtn">Size guide</span></div>
          <div class="size-row" id="sizeRow">
            ${p.sizes.map((s) => `<button data-s="${s}" ${((p.stock || {})[s] || 0) <= 0 ? 'disabled' : ''}>${s}</button>`).join('')}
          </div>
          <div class="low-stock" id="stockNote"></div>
        </div>
        <div style="margin-bottom:6px">
          <div class="opt-label">Quantity</div>
          <div class="qty-row">
            <button id="qMinus" aria-label="Decrease quantity">−</button><span id="qVal">1</span><button id="qPlus" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="buy-row">
          <button class="btn ghost" id="addBtn" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold Out' : 'Add to Bag'}</button>
          <button class="btn" id="buyBtn" ${soldOut ? 'disabled' : ''}>Buy Now</button>
        </div>
        <div class="accordion">
          ${acc('Description', `<p>${esc(p.description)}</p>`, true)}
          ${acc('Details', p.details?.length ? `<ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p>Details coming soon.</p>')}
          ${acc('Fabric & Fit', `<p><strong>Fabric:</strong> ${esc(p.fabric || 'Fabric details coming soon')}</p>${p.fit ? `<p><strong>Fit:</strong> ${esc(p.fit)}</p>` : ''}`)}
          ${acc('Care', p.care?.length ? `<ul>${p.care.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p>Care instructions coming soon.</p>')}
          ${acc('Shipping', `<p>Each piece is prepared to order with care. Free shipping on orders above ${money(SBAM.settings?.shipping?.freeAbove ?? 1999)}; otherwise a flat ${money(SBAM.settings?.shipping?.flatRate ?? 79)} applies. Cash on Delivery available. See <a href="shipping-returns.html" style="text-decoration:underline">Shipping &amp; Returns</a>.</p>`)}
          ${acc('Exchange & Returns', `<p>Size exchanges are supported — raise a request within 48 hours of delivery from the <a href="contact.html" style="text-decoration:underline">contact page</a> with your order ID. Full policy on the <a href="shipping-returns.html" style="text-decoration:underline">Shipping &amp; Returns</a> page.</p>`)}
        </div>
      </div>`;

    /* interactions */
    const mainImg = document.getElementById('mainImg');
    document.getElementById('thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      imgIdx = +b.dataset.i;
      mainImg.src = p.images[imgIdx].src;
      mainImg.alt = p.images[imgIdx].alt;
      mainImg.classList.toggle('contain', isSheet(p.images[imgIdx].src));
      document.querySelectorAll('#thumbs button').forEach((t) => t.classList.toggle('on', t === b));
    });

    document.getElementById('sizeRow').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-s]');
      if (!b || b.disabled) return;
      selSize = b.dataset.s;
      document.querySelectorAll('#sizeRow button').forEach((x) => x.classList.toggle('on', x === b));
      const left = (p.stock || {})[selSize] || 0;
      document.getElementById('stockNote').textContent = left > 0 && left <= 3 ? `Only ${left} left in this size` : '';
    });

    document.getElementById('qMinus').addEventListener('click', () => setQty(qty - 1));
    document.getElementById('qPlus').addEventListener('click', () => setQty(qty + 1));
    function setQty(v) {
      qty = Math.max(1, Math.min(10, v));
      document.getElementById('qVal').textContent = qty;
    }

    document.getElementById('sizeGuideBtn').addEventListener('click', SBAM.openSizeGuide);
    document.getElementById('addBtn').addEventListener('click', () => { if (requireSize()) SBAM.addToCart(p.id, selSize, qty, true); });
    document.getElementById('buyBtn').addEventListener('click', () => {
      if (!requireSize()) return;
      SBAM.addToCart(p.id, selSize, qty, false);
      location.href = 'checkout.html';
    });
    function requireSize() {
      if (!selSize) {
        SBAM.toast('Please select a size');
        document.getElementById('sizeRow').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      return true;
    }

    document.querySelectorAll('.acc-item > button').forEach((b) =>
      b.addEventListener('click', () => b.parentElement.classList.toggle('open')));
  }

  function acc(title, body, open = false) {
    return `<div class="acc-item ${open ? 'open' : ''}"><button>${title}<span>+</span></button><div class="acc-body">${body}</div></div>`;
  }

  function renderReviews() {
    const el = document.getElementById('reviewsBlock');
    if (!reviews.length) {
      el.innerHTML = `<span class="kicker">Reviews</span>
        <p class="empty-note" style="margin-top:10px">No reviews yet — be the first to share how you styled it. Reviews can be shared through the <a href="contact.html" style="text-decoration:underline">contact page</a> after your order is delivered.</p>`;
      return;
    }
    el.innerHTML = `<span class="kicker">Reviews (${reviews.length})</span>` + reviews.map((r) => `
      <div style="border-bottom:1px solid var(--line-soft);padding:16px 0">
        <strong>${esc(r.name)}</strong> · <span style="color:var(--gold)">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        <p style="margin:6px 0 0;color:var(--charcoal)">${esc(r.text)}</p>
      </div>`).join('');
  }

  function renderRelated() {
    const rel = SBAM.products
      .filter((x) => x.id !== product.id)
      .sort((a, b) => (b.category === product.category) - (a.category === product.category))
      .slice(0, 4);
    document.getElementById('relatedGrid').innerHTML = rel.map((p) => SBAM.productCard(p)).join('');
  }

  function injectSEO() {
    const p = product;
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.name, sku: p.sku, description: p.description,
      image: p.images.map((i) => location.origin + i.src),
      brand: { '@type': 'Brand', name: 'SANJHH BY AM' },
      offers: {
        '@type': 'Offer', priceCurrency: 'INR', price: p.salePrice,
        availability: Object.values(p.stock || {}).some((q) => q > 0)
          ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: location.href,
      },
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }
})();
