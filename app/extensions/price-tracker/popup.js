const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

async function render() {
  const { products = {} } = await chrome.storage.local.get('products');
  const items = Object.values(products).sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  const list = document.getElementById('list');
  list.textContent = '';
  for (const p of items) {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'tracker-item');
    li.setAttribute('data-product-id', p.id);
    li.textContent = `${p.name}: ${euro.format(p.lastCents / 100)} (lowest ${euro.format(p.lowestCents / 100)})`;
    list.appendChild(li);
  }
  document.getElementById('empty').hidden = items.length > 0;
}

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('products');
  render();
});

render();
