# PlayLab Price Tracker (practice extension)

A tiny Manifest V3 Chrome extension for practising Playwright's extension support. On PlayLab Shop product
pages (`http://localhost:*/products/:id`) it:

- reads the price from `[data-testid="product-price"]` (its `data-price-cents`, always EUR);
- remembers the lowest price seen per product in `chrome.storage.local`;
- shows a badge, `[data-testid="price-tracker-badge"]`, reading "Price Tracker: €89.99 · lowest €89.99".

The badge also carries `data-price-cents` and `data-lowest-cents`. The toolbar popup (`popup.html`) lists the tracked products.

## Loading it in Playwright

Extensions only work in Chromium with a persistent context, and branded Google Chrome ignores
`--load-extension`, so use Playwright's bundled Chromium:

```ts
import { chromium } from '@playwright/test';
import path from 'path';

const extension = path.resolve(__dirname, '../app/extensions/price-tracker');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', // the new headless mode, which supports extensions
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
```

Get the extension's ID from its background service worker, then open the popup as a normal page.
Chromium has built-in extensions with workers of their own, so pick this one by its manifest name:

```ts
if (!context.serviceWorkers().some((w) => w.url().endsWith('/background.js'))) await context.waitForEvent('serviceworker');
let extensionId = '';
for (const worker of context.serviceWorkers()) {
  if ((await worker.evaluate(() => chrome.runtime.getManifest().name)) === 'PlayLab Price Tracker') {
    extensionId = worker.url().split('/')[2];
  }
}

const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
await expect(popup.getByTestId('tracker-item')).toHaveCount(1);
```
