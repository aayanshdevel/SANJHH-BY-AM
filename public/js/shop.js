/* Shop / collection page: filtering, sorting, search results */
(function () {
  const params = new URLSearchParams(location.search);
  const state = {
    cat: params.get('cat') || '',
    tag: params.get('tag') || '',
    q: (params.get('q') || '').toLowerCase(),
    sizes: new Set(), colors: new Set(), occasions: new Set(),
    price: new Set(), discount: new Set(), inStockOnly: false,
    sort: 'featured',
  };

  const PRICE_BANDS = [
    ['under-1500', 'Under ₹1,500', (p) => p.salePrice < 1500],
    ['1500-2000', '₹1,500 – ₹2,000', (p) => p.salePrice >= 1500 && p.salePrice <= 2000],
    ['above-2000', 'Above ₹2,000', (p) => p.salePrice > 2000],
  ];
  const DISCOUNT_BANDS = [
    ['20', '20% or more', 20],
    ['30', '30% or more', 30],
    ['40', '40% or more', 40],
  ];

  const titles = {
    tag: { new: ['Just In', 'New Arrivals'], bestseller: ['Most Loved', 'Best Sellers'], sale: ['Limited Time', 'Sale'] },
  };

  SBAM.ready(() => {
    const P = SBAM.products;

    /* page title */
    const head = document.getElementById('shopTitle');
    const kick = document.getElementById('shopKicker');
    if (state.q) { head.textContent = `Search: “${params.get('q')}”`; kick.textContent = 'Results'; }
    else if (state.cat && SBAM.CATEGORY_LABELS[state.cat]) { head.textContent = SBAM.CATEGORY_LABELS[state.cat]; kick.textContent = 'The Collection'; }
    else if (state.tag && titles.tag[state.tag]) { kick.textContent = titles.tag[state.tag][0]; head.textContent = titles.tag[state.tag][1]; }
    document.title = `${head.textContent} — SANJHH BY AM`;

    buildFilters(P);
    render();

    document.getElementById('sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    document.getElementById('clearFilters').addEventListener('click', () => {
      ['sizes', 'colors', 'occasions', 'price', 'discount'].forEach((k) => state[k].clear());
      state.inStockOnly = false;
      document.querySelectorAll('#filterGroups input[type=checkbox]').forEach((c) => { c.checked = false; });
      render();
    });
    const fp = document.getElementById('filtersPanel');
    document.getElementById('openFilters').addEventListener('click', () => {
      fp.classList.add('open');
      document.getElementById('filtersMobileHead').style.display = 'flex';
    });
    document.getElementById('closeFilters').addEventListener('click', () => fp.classList.remove('open'));
  });

  function buildFilters(P) {
    const pool = basePool(P);
    const cats = Object.entries(SBAM.CATEGORY_LABELS).filter(([k]) => P.some((p) => p.category === k));
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const colors = [...new Map(pool.map((p) => [p.color?.name, p.color])).values()].filter(Boolean);
    const occasions = [...new Set(pool.flatMap((p) => p.occasions || []))].sort();

    const g = (title, id, body) => `
      <div class="fgroup"><div class="ftitle" data-toggle="${id}">${title}<span>−</span></div>
      <div class="fbody" id="${id}">${body}</div></div>`;

    let html = '';
    if (!state.cat) {
      html += g('Category', 'fg-cat', cats.map(([k, label]) =>
        `<label><input type="checkbox" data-f="cat" value="${k}"> ${label}</label>`).join(''));
    }
    html += g('Size', 'fg-size', sizes.map((s) =>
      `<label><input type="checkbox" data-f="sizes" value="${s}"> ${s}</label>`).join(''));
    html += g('Colour', 'fg-color', colors.map((c) =>
      `<label><input type="checkbox" data-f="colors" value="${SBAM.esc(c.name)}"> <span class="swatch" style="background:${c.hex}"></span>${SBAM.esc(c.name)}</label>`).join(''));
    html += g('Price', 'fg-price', PRICE_BANDS.map(([id, label]) =>
      `<label><input type="checkbox" data-f="price" value="${id}"> ${label}</label>`).join(''));
    html += g('Occasion', 'fg-occ', occasions.map((o) =>
      `<label><input type="checkbox" data-f="occasions" value="${SBAM.esc(o)}"> ${SBAM.esc(o)}</label>`).join(''));
    html += g('Discount', 'fg-disc', DISCOUNT_BANDS.map(([id, label]) =>
      `<label><input type="checkbox" data-f="discount" value="${id}"> ${label}</label>`).join(''));
    html += g('Availability', 'fg-avail', `<label><input type="checkbox" data-f="stock" value="in"> In stock only</label>`);

    const box = document.getElementById('filterGroups');
    box.innerHTML = html;
    state.catFilter = new Set();

    box.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.dataset.f) return;
      if (el.dataset.f === 'stock') { state.inStockOnly = el.checked; }
      else if (el.dataset.f === 'cat') { el.checked ? state.catFilter.add(el.value) : state.catFilter.delete(el.value); }
      else { el.checked ? state[el.dataset.f].add(el.value) : state[el.dataset.f].delete(el.value); }
      render();
    });
    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const body = document.getElementById(t.dataset.toggle);
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'flex';
      t.querySelector('span').textContent = open ? '+' : '−';
    });
  }

  function basePool(P) {
    let pool = P.slice();
    if (state.cat) pool = pool.filter((p) => p.category === state.cat);
    if (state.tag === 'new') pool = pool.filter((p) => p.flags.newArrival);
    if (state.tag === 'bestseller') pool = pool.filter((p) => p.flags.bestseller);
    if (state.tag === 'sale') pool = pool.filter((p) => p.flags.sale && p.discountPct > 0);
    if (state.q) pool = pool.filter((p) =>
      [p.name, p.category, p.color?.name, p.description, ...(p.tags || [])].join(' ').toLowerCase().includes(state.q));
    return pool;
  }

  function render() {
    let pool = basePool(SBAM.products);
    if (state.catFilter?.size) pool = pool.filter((p) => state.catFilter.has(p.category));
    if (state.sizes.size) pool = pool.filter((p) => [...state.sizes].some((s) => ((p.stock || {})[s] || 0) > 0));
    if (state.colors.size) pool = pool.filter((p) => state.colors.has(p.color?.name));
    if (state.occasions.size) pool = pool.filter((p) => (p.occasions || []).some((o) => state.occasions.has(o)));
    if (state.price.size) pool = pool.filter((p) => PRICE_BANDS.some(([id, , fn]) => state.price.has(id) && fn(p)));
    if (state.discount.size) pool = pool.filter((p) => [...state.discount].some((d) => p.discountPct >= +d));
    if (state.inStockOnly) pool = pool.filter((p) => Object.values(p.stock || {}).some((q) => q > 0));

    if (state.sort === 'price-asc') pool.sort((a, b) => a.salePrice - b.salePrice);
    else if (state.sort === 'price-desc') pool.sort((a, b) => b.salePrice - a.salePrice);
    else if (state.sort === 'newest') pool.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    else pool.sort((a, b) => (b.flags.featured - a.flags.featured) || (b.flags.bestseller - a.flags.bestseller));

    document.getElementById('resultCount').textContent =
      `${pool.length} ${pool.length === 1 ? 'piece' : 'pieces'}`;
    document.getElementById('productGrid').innerHTML = pool.map((p) => SBAM.productCard(p)).join('');
    document.getElementById('emptyBox').innerHTML = pool.length ? '' :
      `<div class="empty-state"><div class="big">Nothing matches those filters</div>
       <p>Try removing a filter or browse the full collection.</p>
       <a class="btn sm" href="shop.html">View All Pieces</a></div>`;
  }
})();
