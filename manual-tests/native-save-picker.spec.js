import { test, expect } from '@playwright/test';

test('select an image and save PNG through the native Chrome picker', async ({ page }) => {
  await page.goto('/');
  await page.locator('#project-name').fill('Ảnh thử Chrome');
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.locator('#file-input').setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.layer-caption strong').filter({ hasText: 'source.png' })).toBeVisible();

  await page.evaluate(() => {
    const nativePicker = window.showSaveFilePicker;
    if (typeof nativePicker !== 'function') throw new Error('Chrome không hỗ trợ showSaveFilePicker().');
    window.pickerOutcome = null;
    window.showSaveFilePicker = options => {
      let pickerPromise;
      try {
        pickerPromise = nativePicker.call(window, options);
      } catch (error) {
        window.pickerOutcome = { ok: false, name: error.name, message: error.message };
        throw error;
      }
      return pickerPromise.then(handle => {
        window.pickerOutcome = { ok: true, filename: handle.name };
        return handle;
      }, error => {
        window.pickerOutcome = { ok: false, name: error.name, message: error.message };
        throw error;
      });
    };
  });

  await page.locator('#export').click();
  await expect.poll(() => page.evaluate(() => window.pickerOutcome), { timeout: 120_000 }).not.toBeNull();
  const outcome = await page.evaluate(() => window.pickerOutcome);
  expect(outcome).toMatchObject({ ok: true });
  await expect(page.locator('#toast')).toHaveText(`Đã lưu ${outcome.filename}.`);
});
