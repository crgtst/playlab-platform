import { Locator, Page } from '@playwright/test';

/**
 * Stand-ins for browser APIs a test cannot drive for real. Each runs before the page's own scripts, and keeps its
 * state on `window` so a test can read what the page did and trigger what the browser would.
 */

export type NotificationPermission = 'default' | 'granted' | 'denied';

/** Replaces `Notification`: records every notification shown, and answers permission requests with "granted". */
export async function mockNotifications(page: Page, permission: NotificationPermission) {
  await page.addInitScript((initial) => {
    const state = { permission: initial, requests: 0, shown: [] as { title: string; body?: string }[] };
    class FakeNotification {
      onclick: (() => void) | null = null;
      constructor(title: string, options?: NotificationOptions) {
        state.shown.push({ title, body: options?.body });
      }
      static get permission() {
        return state.permission;
      }
      static requestPermission() {
        state.requests++;
        state.permission = 'granted';
        return Promise.resolve('granted');
      }
      close() {}
    }
    Object.assign(window, { Notification: FakeNotification, __notifications: state });
  }, permission);
}

export function shownNotifications(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __notifications: { shown: { title: string; body?: string }[] } }).__notifications.shown,
  );
}

export function notificationPermissionRequests(page: Page) {
  return page.evaluate(() => (window as unknown as { __notifications: { requests: number } }).__notifications.requests);
}

/** Gives the page a Battery Status API with these readings. Chromium has one, but it reads the real battery. */
export async function mockBattery(page: Page, battery: { level: number; charging: boolean }) {
  await page.addInitScript((initial) => {
    const manager = Object.assign(new EventTarget(), initial);
    Object.defineProperty(navigator, 'getBattery', { value: () => Promise.resolve(manager), configurable: true });
    Object.assign(window, { __battery: manager });
  }, battery);
}

/** Takes the Battery Status API away, as in Firefox and Safari. */
export async function removeBattery(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getBattery', { value: undefined, configurable: true }));
}

/** Changes a mocked battery reading and fires the event the browser would. */
export function changeBattery(page: Page, change: { level?: number; charging?: boolean }) {
  return page.evaluate((c) => {
    const battery = (window as unknown as { __battery: EventTarget & { level: number; charging: boolean } }).__battery;
    if (c.level !== undefined) {
      battery.level = c.level;
      battery.dispatchEvent(new Event('levelchange'));
    }
    if (c.charging !== undefined) {
      battery.charging = c.charging;
      battery.dispatchEvent(new Event('chargingchange'));
    }
  }, change);
}

/** A one-finger swipe across the middle of an element, sent as real touch input (needs `hasTouch`). */
export async function swipe(page: Page, target: Locator, dx: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Cannot swipe an element that is not on screen');
  const y = box.y + box.height / 2;
  const from = box.x + box.width / 2 - dx / 2;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let step = 1; step <= 5; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (dx * step) / 5, y }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}
