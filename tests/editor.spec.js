import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function makeImage(page, color, width, height) {
  const data = await page.evaluate(({ color, width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    return canvas.toDataURL().split(',')[1];
  }, { color, width, height });
  return Buffer.from(data, 'base64');
}

async function upload(page, name, color, width, height) {
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'image/png', buffer: await makeImage(page, color, width, height) });
  await expect(page.locator('#status')).toHaveText('Sẵn sàng chỉnh ảnh');
  await expect(page.locator('.layer-caption strong').filter({ hasText: name })).toBeVisible();
}

async function exportedImage(page) {
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  page.once('dialog', dialog => dialog.accept(dialog.defaultValue()));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  const data = (await readFile(await download.path())).toString('base64');
  return page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, center: [...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data], corner: [...context.getImageData(0, 0, 1, 1).data], bottomRight: [...context.getImageData(image.width - 1, image.height - 1, 1, 1).data] };
  }, data);
}

test('upload, overlay order, undo, redo and full-size PNG pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#export')).toBeDisabled();
  await upload(page, 'original.png', '#ff0000', 1001, 667);
  await upload(page, 'overlay.png', '#0000ff', 220, 160);
  await expect(page.locator('#layer-count')).toHaveText('2');
  await page.locator('#zoom-out').click();
  expect(await exportedImage(page)).toMatchObject({ width: 1001, height: 667, center: [0, 0, 255, 255], corner: [255, 0, 0, 255], bottomRight: [255, 0, 0, 255] });
  await page.locator('#lower').click();
  expect((await exportedImage(page)).center).toEqual([255, 0, 0, 255]);
  await page.locator('#undo').click();
  await expect(page.locator('#redo')).toBeEnabled();
  expect((await exportedImage(page)).center).toEqual([0, 0, 255, 255]);
  await page.locator('#redo').click();
  await expect(page.locator('#redo')).toBeDisabled();
  expect((await exportedImage(page)).center).toEqual([255, 0, 0, 255]);
  await page.screenshot({ path: 'test-results/desktop.png' });
});

test('clipboard image, text formatting, visibility, lock, duplicate and delete', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const image = await makeImage(page, '#00aa77', 800, 600);
  await page.evaluate(async data => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'clipboard.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, image.toString('base64'));
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Thêm chữ', exact: true }).click();
  await page.locator('#text-content').fill('Xin chào Việt Nam');
  await page.locator('#font-size').fill('48');
  await page.locator('#font-family').selectOption('Georgia');
  await page.locator('#bold').click();
  await page.locator('#italic').click();
  await page.locator('#underline').click();
  await page.locator('#align-center').click();
  await expect(page.locator('#bold')).toHaveClass(/active/);
  await expect(page.locator('#font-size')).toHaveValue('48');
  await page.locator('#text-color').fill('#ff00ff');
  await page.locator('#rotation').fill('15');
  await page.locator('#rotation').press('Tab');
  await page.locator('#duplicate').click();
  await expect(page.locator('#layer-count')).toHaveText('3');
  await expect(page.locator('#text-content')).toHaveValue('Xin chào Việt Nam');
  await expect(page.locator('#text-color')).toHaveValue('#ff00ff');
  await page.locator('#delete').click();
  await expect(page.locator('#layer-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Ẩn Văn bản mới', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hiện Văn bản mới', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hiện Văn bản mới', exact: true }).click();
  await page.getByRole('button', { name: 'Khóa Văn bản mới', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mở khóa Văn bản mới', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở khóa Văn bản mới', exact: true }).click();
  await page.locator('.layer-select').first().click();
  await expect(page.locator('#rotation')).toHaveValue('15');
  await page.locator('#canvas-width').fill('900');
  await page.locator('#canvas-width').press('Tab');
  const png = await exportedImage(page);
  expect(png.width).toBe(900);
  expect(png.corner[3]).toBe(255);
  await page.screenshot({ path: 'test-results/text-editing.png' });
});

test('mobile panels, text-only PNG transparency and validation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: 'test-results/mobile-empty.png' });
  await page.getByRole('button', { name: 'Thêm chữ', exact: true }).click();
  await expect(page.locator('#text-content')).toBeVisible();
  await page.locator('#text-content').fill('Tiếng Việt');
  await page.getByRole('button', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('button', { name: 'Danh sách lớp', exact: true }).click();
  await expect(page.locator('#canvas-width')).toBeVisible();
  await page.locator('#canvas-width').fill('0');
  await page.locator('#canvas-width').press('Tab');
  await expect(page.locator('#canvas-width')).toHaveValue('1200');
  await page.getByRole('button', { name: 'Danh sách lớp', exact: true }).click();
  const result = await exportedImage(page);
  expect(result).toMatchObject({ width: 1200, height: 800 });
  expect(result.corner[3]).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile-editor.png' });
});

test('paste Vietnamese text onto canvas and into text field, paste hex and undo color', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => navigator.clipboard.writeText('Xin chào Việt Nam\nDòng thứ hai'));
  await page.locator('#viewport').click();
  await page.keyboard.press('Control+v');
  await expect(page.locator('#layer-count')).toHaveText('1');
  await expect(page.locator('#text-content')).toHaveValue('Xin chào Việt Nam\nDòng thứ hai');
  await page.evaluate(() => navigator.clipboard.writeText('Nội dung được dán'));
  await page.locator('#text-content').selectText();
  await page.locator('#text-content').press('Control+v');
  await expect(page.locator('#text-content')).toHaveValue('Nội dung được dán');
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.evaluate(() => navigator.clipboard.writeText('#1a2B3c'));
  await page.locator('#text-hex').selectText();
  await page.locator('#text-hex').press('Control+v');
  await page.locator('#text-hex').press('Tab');
  await expect(page.locator('#text-color')).toHaveValue('#1a2b3c');
  await expect(page.locator('#text-hex')).toHaveValue('#1a2b3c');
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.locator('#text-hex').fill('f0a');
  await page.locator('#text-hex').press('Tab');
  await expect(page.locator('#text-color')).toHaveValue('#ff00aa');
  await page.locator('#undo').click();
  await page.locator('.layer-select').first().click();
  await expect(page.locator('#text-hex')).toHaveValue('#1a2b3c');
  await page.locator('#text-hex').fill('not-a-color');
  await page.locator('#text-hex').press('Tab');
  await expect(page.locator('#text-hex')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#text-color')).toHaveValue('#1a2b3c');
  await page.locator('#text-color').fill('#008855');
  await page.locator('#text-color').press('Tab');
  await expect(page.locator('#text-hex')).toHaveValue('#008855');
  await expect(page.locator('#text-hex')).toHaveAttribute('aria-invalid', 'false');
  await page.screenshot({ path: 'test-results/hex-and-paste.png' });
});

test('paste button reads plain text as a new layer', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => navigator.clipboard.writeText('Văn bản từ clipboard'));
  await page.locator('#paste').click();
  await expect(page.locator('#text-content')).toHaveValue('Văn bản từ clipboard');
  await expect(page.locator('#layer-count')).toHaveText('1');
});

test('save picker receives suggested filename and writes a full-size PNG', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-text').click();
  await page.locator('#project-name').fill('Thiết kế mới');
  await page.evaluate(() => {
    window.showSaveFilePicker = async options => {
      window.saveOptions = options;
      return {
        name: 'ten-da-chon.png',
        createWritable: async () => ({
          write: async blob => { window.savedBlob = blob; },
          close: async () => { window.saveClosed = true; },
        }),
      };
    };
  });
  const previousZoom = await page.locator('#zoom-label').textContent();
  await page.locator('#export').click();
  await expect(page.locator('#toast')).toHaveText('Đã lưu ten-da-chon.png.');
  const saved = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.savedBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = pixels.some((value, index) => index % 4 === 3 && value > 0);
    return { options: window.saveOptions, width: bitmap.width, height: bitmap.height, mime: window.savedBlob.type, closed: window.saveClosed, hasContent };
  });
  expect(saved).toMatchObject({ options: { suggestedName: 'Thiết kế mới.png', types: [{ accept: { 'image/png': ['.png'] } }] }, width: 1200, height: 800, mime: 'image/png', closed: true, hasContent: true });
  await expect(page.locator('#zoom-label')).toHaveText(previousZoom);
  await expect(page.locator('#export')).toBeEnabled();
});

test('cancel picker does not download; fallback asks filename and supports cancel', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-text').click();
  const downloads = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('Canceled', 'AbortError'); }; });
  await page.locator('#export').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('Sẵn sàng chỉnh ảnh');
  expect(downloads).toEqual([]);
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#export').click();
  await expect(page.locator('#export')).toBeEnabled();
  expect(downloads).toEqual([]);
  page.once('dialog', dialog => dialog.accept('ảnh tôi muốn lưu'));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ảnh tôi muốn lưu.png');
});