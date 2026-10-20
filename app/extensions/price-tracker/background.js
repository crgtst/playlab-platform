// Background service worker. It does little, but gives tests a stable way to find the extension ID:
// context.serviceWorkers() / context.waitForEvent('serviceworker') in Playwright.
chrome.runtime.onInstalled.addListener(async () => {
  const { products } = await chrome.storage.local.get('products');
  if (!products) await chrome.storage.local.set({ products: {} });
});
