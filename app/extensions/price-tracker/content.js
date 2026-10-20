// PlayLab Price Tracker content script.
// Watches PlayLab Shop product pages (a single-page app, so it observes the DOM rather than page loads),
// reads the price from data-price-cents, stores the lowest price seen, and shows a small badge.
(() => {
  const BADGE_ID = 'playlab-price-tracker-badge';
  const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  let lastKey = '';

  function badge() {
    let el = document.getElementById(BADGE_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BADGE_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('data-testid', 'price-tracker-badge');
      el.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:8px 12px;border-radius:8px;' +
        'background:#3a2f8f;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)';
      document.body.appendChild(el);
    }
    return el;
  }

  async function update() {
    const detail = document.querySelector('[data-testid="product-detail"]');
    const priceEl = detail && detail.querySelector('[data-testid="product-price"]');
    const titleEl = detail && detail.querySelector('[data-testid="product-title"]');
    if (!detail || !priceEl || !titleEl) {
      document.getElementById(BADGE_ID)?.remove();
      lastKey = '';
      return;
    }
    const id = detail.getAttribute('data-product-id');
    const cents = Number(priceEl.getAttribute('data-price-cents'));
    const key = `${id}:${cents}`;
    if (!id || !Number.isFinite(cents) || key === lastKey) return;
    lastKey = key;

    const { products = {} } = await chrome.storage.local.get('products');
    const previous = products[id];
    const lowest = previous ? Math.min(previous.lowestCents, cents) : cents;
    products[id] = { id, name: titleEl.textContent.trim(), lastCents: cents, lowestCents: lowest, seenAt: new Date().toISOString() };
    await chrome.storage.local.set({ products });

    const el = badge();
    el.setAttribute('data-price-cents', String(cents));
    el.setAttribute('data-lowest-cents', String(lowest));
    el.textContent = `Price Tracker: ${euro.format(cents / 100)} · lowest ${euro.format(lowest / 100)}`;
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-price-cents'] });
  update();
})();
