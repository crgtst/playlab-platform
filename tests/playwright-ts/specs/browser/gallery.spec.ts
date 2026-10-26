import { product } from '../../support/data';
import { swipe } from '../../support/browser';
import { expect, test } from '../../support/fixtures';
import type { Page } from '@playwright/test';

// A product with three images (see the "Image 1 of 3" status).
const gallerySku = 'EL-008';

async function openGallery(page: Page) {
  await page.goto(`/products/${product(gallerySku).id}`);
  const gallery = page.getByTestId('product-gallery');
  await expect(gallery).toBeVisible();
  return gallery;
}

test.describe('PLS-18 Product gallery and touch', () => {
  test.describe('on a touch device', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test('PLS-18.1 swiping left shows the next image and moves the position dots', async ({ page }) => {
      const gallery = await openGallery(page);
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 1 of 3');
      await expect(page.getByTestId('gallery-dot-1')).toHaveAttribute('aria-current', 'true');

      await swipe(page, page.getByTestId('gallery-stage'), -120);
      await expect(gallery).toHaveAttribute('data-index', '1');
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 2 of 3');
      await expect(page.getByTestId('gallery-dot-2')).toHaveAttribute('aria-current', 'true');
      await expect(page.getByTestId('gallery-dot-1')).not.toHaveAttribute('aria-current', 'true');

      // Swiping right goes back.
      await swipe(page, page.getByTestId('gallery-stage'), 120);
      await expect(gallery).toHaveAttribute('data-index', '0');
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 1 of 3');
    });

    test('PLS-18.2 tapping an image shows the next one and moves the status on by one', async ({ page }) => {
      await openGallery(page);
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 1 of 3');

      await page.getByTestId('gallery-stage').tap();
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 2 of 3');
      await page.getByTestId('gallery-stage').tap();
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 3 of 3');
      // After the last image it starts again.
      await page.getByTestId('gallery-stage').tap();
      await expect(page.getByTestId('gallery-status')).toHaveText('Image 1 of 3');
    });
  });

  test('PLS-18.3 on desktop the arrow buttons are shown and work with the keyboard', async ({ page }) => {
    const gallery = await openGallery(page);
    const next = page.getByTestId('gallery-next');
    const previous = page.getByTestId('gallery-prev');
    await expect(next).toBeVisible();
    await expect(previous).toBeVisible();

    // The buttons take the keyboard's Enter and Space keys.
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('gallery-status')).toHaveText('Image 2 of 3');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('gallery-status')).toHaveText('Image 3 of 3');
    await previous.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('gallery-status')).toHaveText('Image 2 of 3');

    // The gallery itself takes the arrow keys.
    await gallery.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('gallery-status')).toHaveText('Image 3 of 3');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('gallery-status')).toHaveText('Image 1 of 3');
  });
});
