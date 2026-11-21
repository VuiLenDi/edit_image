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

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function openExportDialog(page) {
  await page.locator('#export').click();
  await expect(page.locator('#export-dialog')).toBeVisible();
}

async function confirmExport(page) {
  await page.locator('#export-confirm').click();
}

async function exportedImage(page, targetColor) {
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  page.once('dialog', dialog => dialog.accept(dialog.defaultValue()));
  const downloadPromise = page.waitForEvent('download');
  await openExportDialog(page);
  await confirmExport(page);
  const download = await downloadPromise;
  const data = (await readFile(await download.path())).toString('base64');
  return page.evaluate(async ({ data, targetColor }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const expected = targetColor ? targetColor.slice(1).match(/../g).map(value => parseInt(value, 16)) : null;
    let matchingPixels = 0;
    if (expected) for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === expected[0] && pixels[index + 1] === expected[1] && pixels[index + 2] === expected[2] && pixels[index + 3] > 0) matchingPixels++;
    }
    return { width: image.width, height: image.height, center: [...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data], corner: [...context.getImageData(0, 0, 1, 1).data], bottomRight: [...context.getImageData(image.width - 1, image.height - 1, 1, 1).data], matchingPixels };
  }, { data, targetColor });
}

test('iPhone Home Screen installation metadata and icons', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse).toBeOK();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: 'Lớp - Chỉnh ảnh', short_name: 'Lớp', display: 'standalone' });

  for (const [path, size] of [['/icons/apple-touch-icon.png', 180], ['/icons/icon-192.png', 192], ['/icons/icon-512.png', 512]]) {
    const iconResponse = await request.get(path);
    expect(iconResponse).toBeOK();
    expect(iconResponse.headers()['content-type']).toContain('image/png');
    expect(Buffer.from(await iconResponse.body()).readUInt32BE(16)).toBe(size);
  }
});

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

test('merge selected layers into one raster layer with undo and redo', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'base.png', '#ff0000', 100, 100);
  await upload(page, 'overlay.png', '#0000ff', 100, 100);
  await expect(page.locator('#merge-layers')).toBeDisabled();
  await page.locator('.layer-select').nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#merge-layers')).toBeEnabled();
  const before = await exportedImage(page);

  await page.locator('#merge-layers').click();
  await expect(page.locator('#layer-count')).toHaveText('1');
  await expect(page.locator('.layer-caption strong')).toHaveText('Đã gộp 2 lớp');
  const merged = await exportedImage(page);
  expect(merged.center).toEqual(before.center);
  expect(merged.corner).toEqual(before.corner);

  await page.locator('#undo').click();
  await expect(page.locator('#layer-count')).toHaveText('2');
  expect((await exportedImage(page)).center).toEqual(before.center);
  await page.locator('#redo').click();
  await expect(page.locator('#layer-count')).toHaveText('1');
  expect((await exportedImage(page)).center).toEqual(merged.center);
});

test('dragging a layer row reorders the stack and supports undo', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'base.png', '#ff0000', 100, 100);
  await upload(page, 'middle.png', '#0000ff', 100, 100);
  await upload(page, 'top.png', '#00ff00', 100, 100);
  expect(await page.locator('.layer-row').evaluateAll(rows => rows.map(row => row.querySelector('strong').textContent))).toEqual(['top.png', 'middle.png', 'base.png']);
  expect((await exportedImage(page)).center).toEqual([0, 255, 0, 255]);
  const sourceHandle = await page.locator('.layer-row').nth(0).locator('.layer-drag-handle').boundingBox();
  const targetRow = await page.locator('.layer-row').nth(1).boundingBox();
  await page.mouse.move(sourceHandle.x + sourceHandle.width / 2, sourceHandle.y + sourceHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetRow.x + 15, targetRow.y + targetRow.height * 0.75, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.layer-caption strong').nth(0)).toHaveText('middle.png');
  expect((await exportedImage(page)).center).toEqual([0, 0, 255, 255]);

  await page.locator('#undo').click();
  await expect(page.locator('.layer-caption strong').nth(0)).toHaveText('top.png');
  expect((await exportedImage(page)).center).toEqual([0, 255, 0, 255]);
  await page.locator('#redo').click();
  await expect(page.locator('.layer-caption strong').nth(0)).toHaveText('middle.png');
});

test('image adjustments are per-layer, tonal, resettable and reversible', async ({ page }) => {
  await page.goto('/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context.fillStyle = '#808080';
    context.fillRect(0, 0, 120, 90);
    context.fillStyle = '#202020';
    context.fillRect(0, 0, 40, 90);
    context.fillStyle = '#e0e0e0';
    context.fillRect(80, 0, 40, 90);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#file-input').setInputFiles({ name: 'tones.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  const original = await exportedImage(page);
  await setRange(page, '#shadows', 80);
  const shadowsLifted = await exportedImage(page);
  expect(shadowsLifted.corner[0]).toBeGreaterThan(original.corner[0] + 30);
  expect(Math.abs(shadowsLifted.bottomRight[0] - original.bottomRight[0])).toBeLessThan(3);

  await setRange(page, '#highlights', 80);
  const highlightsLifted = await exportedImage(page);
  expect(highlightsLifted.bottomRight[0]).toBeGreaterThan(shadowsLifted.bottomRight[0] + 5);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.locator('.layer-select').nth(0).click();
  await expect(page.locator('#highlights')).toHaveValue('0');
  expect((await exportedImage(page)).bottomRight).toEqual(shadowsLifted.bottomRight);
  await page.locator('#redo').click();
  await page.locator('.layer-select').nth(0).click();
  await expect(page.locator('#highlights')).toHaveValue('80');

  await setRange(page, '#brightness', 20);
  await setRange(page, '#contrast', 40);
  const adjustedBase = await exportedImage(page);
  expect(adjustedBase.center[0]).not.toBe(128);

  await upload(page, 'overlay.png', '#c08080', 20, 20);
  for (const id of ['brightness', 'highlights', 'shadows', 'contrast', 'saturation', 'grayscale', 'sepia', 'blur', 'hueRotate', 'invert']) {
    await expect(page.locator(`#${id}`)).toHaveValue('0');
  }
  const overlayOriginal = await exportedImage(page);
  await setRange(page, '#saturation', 100);
  const overlaySaturated = await exportedImage(page);
  expect(overlaySaturated.center[0]).toBe(overlayOriginal.center[0]);
  expect(overlaySaturated.center[1]).toBeLessThan(overlayOriginal.center[1]);
  expect(overlaySaturated.center[2]).toBeLessThan(overlayOriginal.center[2]);

  await page.locator('.layer-select').nth(1).click();
  await expect(page.locator('#brightness')).toHaveValue('20');
  await expect(page.locator('#highlights')).toHaveValue('80');
  await expect(page.locator('#shadows')).toHaveValue('80');
  await expect(page.locator('#contrast')).toHaveValue('40');
  await page.locator('#reset-adjustments').click();
  for (const id of ['brightness', 'highlights', 'shadows', 'contrast', 'saturation', 'grayscale', 'sepia', 'blur', 'hueRotate', 'invert']) {
    await expect(page.locator(`#${id}`)).toHaveValue('0');
  }
  await page.locator('#undo').click();
  await page.locator('.layer-select').nth(1).click();
  await expect(page.locator('#brightness')).toHaveValue('20');
});

test('grayscale, sepia, hue, invert, blur and presets affect exported images', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'red.png', '#ff0000', 100, 100);
  await setRange(page, '#grayscale', 100);
  const grayscale = (await exportedImage(page)).center;
  expect(Math.abs(grayscale[0] - grayscale[1])).toBeLessThanOrEqual(1);
  expect(Math.abs(grayscale[1] - grayscale[2])).toBeLessThanOrEqual(1);

  await setRange(page, '#grayscale', 0);
  await setRange(page, '#sepia', 100);
  const sepia = (await exportedImage(page)).center;
  expect(sepia[0]).toBeGreaterThan(sepia[1]);
  expect(sepia[1]).toBeGreaterThan(sepia[2]);

  await setRange(page, '#sepia', 0);
  await setRange(page, '#hueRotate', 90);
  expect((await exportedImage(page)).center.slice(0, 3)).not.toEqual([255, 0, 0]);
  await setRange(page, '#hueRotate', 0);
  await setRange(page, '#invert', 100);
  expect((await exportedImage(page)).center).toEqual([0, 255, 255, 255]);
  await setRange(page, '#invert', 0);

  const splitImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 50, 100);
    context.fillStyle = '#ffffff';
    context.fillRect(50, 0, 50, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#file-input').setInputFiles({ name: 'split.png', mimeType: 'image/png', buffer: Buffer.from(splitImage, 'base64') });
  const sharpEdge = (await exportedImage(page)).center[0];
  await setRange(page, '#blur', 10);
  expect((await exportedImage(page)).center[0]).toBeLessThan(sharpEdge - 10);

  await expect(page.locator('#image-presets [data-preset]')).toHaveCount(8);
  await page.locator('#image-presets [data-preset="grayscale"]').click();
  await expect(page.locator('#grayscale')).toHaveValue('100');
  await expect(page.locator('#image-presets [data-preset="grayscale"]')).toHaveAttribute('aria-pressed', 'true');
  const presetGrayscale = (await exportedImage(page)).center;
  expect(Math.abs(presetGrayscale[0] - presetGrayscale[2])).toBeLessThanOrEqual(1);
  await page.locator('#image-presets [data-preset="original"]').click();
  await expect(page.locator('#image-presets [data-preset="original"]')).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['grayscale', 'sepia', 'blur', 'hueRotate', 'invert']) {
    await expect(page.locator(`#${id}`)).toHaveValue('0');
  }
  await page.locator('#undo').click();
  await page.locator('.layer-select').nth(0).click();
  await expect(page.locator('#grayscale')).toHaveValue('100');
  await page.locator('#redo').click();
  await page.locator('.layer-select').nth(0).click();
  await expect(page.locator('#grayscale')).toHaveValue('0');
});

test('freehand drawing creates editable layers, exports and supports undo', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'base.png', '#ffffff', 120, 90);
  await page.locator('#draw').click();
  await expect(page.locator('#draw')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#brush-color')).toBeVisible();
  await page.locator('#brush-color').fill('#ff0000');
  await setRange(page, '#brush-width', 12);
  const canvas = await page.locator('#canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.15, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.85, canvas.y + canvas.height / 2, { steps: 15 });
  await page.mouse.up();

  await expect(page.locator('#layer-count')).toHaveText('2');
  await expect(page.locator('.layer-caption strong').filter({ hasText: 'Nét vẽ' })).toBeVisible();
  expect((await exportedImage(page)).center).toEqual([255, 0, 0, 255]);
  await page.locator('#undo').click();
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.locator('#redo').click();
  await expect(page.locator('#layer-count')).toHaveText('2');
  expect((await exportedImage(page)).center).toEqual([255, 0, 0, 255]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#draw')).toHaveAttribute('aria-pressed', 'false');
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
  await expect(page.locator('#font-family')).toHaveValue('Arial, Helvetica, sans-serif');
  await page.locator('#text-content').fill('Xin chào Việt Nam');
  await page.locator('#font-size').fill('48');
  await page.locator('#font-family').selectOption('Georgia, serif');
  const fontFamilies = await page.locator('#font-family option').evaluateAll(options => options.map(option => option.value));
  expect(fontFamilies).toEqual(expect.arrayContaining(['Arial, Helvetica, sans-serif', 'Verdana, Geneva, sans-serif', 'Georgia, serif', "'Times New Roman', Times, serif", "'Courier New', Courier, monospace", 'system-ui, sans-serif', 'ui-serif, Georgia, serif', "ui-monospace, 'Courier New', monospace"]));
  expect(fontFamilies).not.toEqual(expect.arrayContaining(['Be Vietnam Pro', 'Dosis', 'Source Sans Pro', 'Helvetica Neue']));
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

test('quick rotation buttons set common angles and support undo', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-text').click();
  await expect(page.locator('#rotation')).toHaveValue('0');

  await page.locator('#rotate-90').click();
  await expect(page.locator('#rotation')).toHaveValue('90');
  await page.locator('#undo').click();
  await page.locator('.layer-select').click();
  await expect(page.locator('#rotation')).toHaveValue('0');
  await page.locator('#redo').click();
  await page.locator('.layer-select').click();
  await expect(page.locator('#rotation')).toHaveValue('90');

  await page.locator('#rotate-minus-90').click();
  await expect(page.locator('#rotation')).toHaveValue('-90');
  await page.locator('#rotate-180').click();
  await expect(page.locator('#rotation')).toHaveValue('180');
  await page.locator('#rotate-reset').click();
  await expect(page.locator('#rotation')).toHaveValue('0');
});

test('multi-select layer alignment and drag-to-resize canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#add-text').click();
  await page.locator('#pos-x').fill('100');
  await page.locator('#pos-x').press('Tab');
  await page.locator('#obj-width').fill('300');
  await page.locator('#obj-width').press('Tab');
  await page.locator('#add-text').click();
  await page.locator('#pos-x').fill('500');
  await page.locator('#pos-x').press('Tab');
  await page.locator('.layer-select').nth(0).click();
  await page.locator('.layer-select').nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#align-layers-left')).toBeEnabled();

  const metrics = async index => {
    await page.locator('.layer-select').nth(index).click();
    return { left: Number(await page.locator('#pos-x').inputValue()), width: Number(await page.locator('#obj-width').inputValue()) };
  };
  const selectBoth = async () => {
    await page.locator('.layer-select').nth(0).click();
    await page.locator('.layer-select').nth(1).click({ modifiers: ['Control'] });
  };

  await page.locator('#align-layers-left').click();
  const leftFirst = await metrics(0);
  const leftSecond = await metrics(1);
  expect(leftFirst.left).toBe(leftSecond.left);
  await selectBoth();
  await page.locator('#align-layers-center').click();
  const centerFirst = await metrics(0);
  const centerSecond = await metrics(1);
  expect(Math.abs((centerFirst.left + centerFirst.width / 2) - (centerSecond.left + centerSecond.width / 2))).toBeLessThanOrEqual(1);
  await selectBoth();
  await page.locator('#align-layers-right').click();
  const rightFirst = await metrics(0);
  const rightSecond = await metrics(1);
  expect(Math.abs((rightFirst.left + rightFirst.width) - (rightSecond.left + rightSecond.width))).toBeLessThanOrEqual(1);

  const initialWidth = Number(await page.locator('#canvas-width').inputValue());
  const initialHeight = Number(await page.locator('#canvas-height').inputValue());
  const zoom = parseInt(await page.locator('#zoom-label').textContent(), 10) / 100;
  const handle = await page.locator('#resize-corner').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 + 30);
  await page.mouse.up();
  await expect(page.locator('#canvas-width')).toHaveValue(String(initialWidth + Math.round(40 / zoom)));
  await expect(page.locator('#canvas-height')).toHaveValue(String(initialHeight + Math.round(30 / zoom)));
  await page.locator('#undo').click();
  await expect(page.locator('#canvas-width')).toHaveValue(String(initialWidth));
  await expect(page.locator('#canvas-height')).toHaveValue(String(initialHeight));
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

test('vertical alignment between layers and all canvas alignment directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#alignment-target').selectOption('canvas');
  await expect(page.locator('#align-layers-center-both')).toBeDisabled();
  await upload(page, 'large.png', '#ff0000', 200, 100);
  await upload(page, 'small.png', '#0000ff', 80, 40);
  for (const [id, value] of [['canvas-width', '1000'], ['canvas-height', '800']]) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press('Tab');
  }
  const metrics = async index => {
    await page.locator('.layer-select').nth(index).click();
    return {
      x: Number(await page.locator('#pos-x').inputValue()),
      y: Number(await page.locator('#pos-y').inputValue()),
      width: Number(await page.locator('#obj-width').inputValue()),
      height: Number(await page.locator('#obj-height').inputValue()),
    };
  };
  const selectBoth = async () => {
    await page.locator('.layer-select').nth(0).click();
    await page.locator('.layer-select').nth(1).click({ modifiers: ['Control'] });
  };
  await page.locator('#alignment-target').selectOption('selection');
  await expect(page.locator('#align-layers-top')).toBeDisabled();
  for (const [alignment, edge] of [
    ['top', bound => bound.y],
    ['middle', bound => bound.y + bound.height / 2],
    ['bottom', bound => bound.y + bound.height],
  ]) {
    for (const [index, y] of [[0, '350'], [1, '100']]) {
      await metrics(index);
      await page.locator('#pos-y').fill(y);
      await page.locator('#pos-y').press('Tab');
    }
    const firstBefore = await metrics(0);
    const secondBefore = await metrics(1);
    const top = Math.min(firstBefore.y, secondBefore.y);
    const bottom = Math.max(firstBefore.y + firstBefore.height, secondBefore.y + secondBefore.height);
    const target = alignment === 'top' ? top : alignment === 'bottom' ? bottom : (top + bottom) / 2;
    await selectBoth();
    await page.locator(`#align-layers-${alignment}`).click();
    const firstAfter = await metrics(0);
    const secondAfter = await metrics(1);
    expect(Math.abs(edge(firstAfter) - target)).toBeLessThanOrEqual(1);
    expect(Math.abs(edge(secondAfter) - target)).toBeLessThanOrEqual(1);
    expect(firstAfter.x).toBe(firstBefore.x);
    expect(secondAfter.x).toBe(secondBefore.x);
  }

  await page.locator('#alignment-target').selectOption('canvas');
  await metrics(0);
  await expect(page.locator('#align-layers-left')).toBeEnabled();
  await page.locator('#zoom-out').click();
  const zoom = await page.locator('#zoom-label').textContent();
  for (const [alignment, edge, target, axis] of [
    ['left', bound => bound.x, 0, 'y'],
    ['center', bound => bound.x + bound.width / 2, 500, 'y'],
    ['right', bound => bound.x + bound.width, 1000, 'y'],
    ['top', bound => bound.y, 0, 'x'],
    ['middle', bound => bound.y + bound.height / 2, 400, 'x'],
    ['bottom', bound => bound.y + bound.height, 800, 'x'],
  ]) {
    const before = await metrics(0);
    await page.locator(`#align-layers-${alignment}`).click();
    const after = await metrics(0);
    expect(Math.abs(edge(after) - target)).toBeLessThanOrEqual(1);
    expect(after[axis]).toBe(before[axis]);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  }
  await page.locator('#align-layers-center-both').click();
  const centered = await metrics(0);
  expect(centered.x + centered.width / 2).toBe(500);
  expect(centered.y + centered.height / 2).toBe(400);
  await expect(page.locator('#zoom-label')).toHaveText(zoom);
  await page.locator('#undo').click();
  await expect(page.locator('#redo')).toBeEnabled();
  const undone = await metrics(0);
  expect(undone.y + undone.height).toBe(800);
  await page.locator('#redo').click();
  expect(await metrics(0)).toEqual(centered);

  await selectBoth();
  await page.locator('#align-layers-center-both').click();
  for (const index of [0, 1]) {
    const bound = await metrics(index);
    expect(bound.x + bound.width / 2).toBe(500);
    expect(bound.y + bound.height / 2).toBe(400);
  }
  await page.locator('#rotation').fill('90');
  await page.locator('#rotation').press('Tab');
  await page.locator('#align-layers-center-both').click();
  const rotated = await metrics(1);
  expect(rotated.x - rotated.height / 2).toBe(500);
  expect(rotated.y + rotated.width / 2).toBe(400);
  await expect(page.locator('#rotation')).toHaveValue('90');

  await page.getByRole('button', { name: 'Khóa large.png', exact: true }).click();
  await expect(page.locator('#align-layers-center-both')).toBeDisabled();
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
  await expect(page.locator('#text-color')).toHaveValue('#ff00aa');
  await page.locator('#text-hex').press('Tab');
  await expect(page.locator('#text-color')).toHaveValue('#ff00aa');
  expect((await exportedImage(page, '#ff00aa')).matchingPixels).toBeGreaterThan(0);
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

test('select an image, confirm PNG save, and write a full-size PNG', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'source.png', '#ff0000', 160, 90);
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
  await openExportDialog(page);
  await confirmExport(page);
  await expect(page.locator('#toast')).toHaveText('Đã lưu ten-da-chon.png.');
  const saved = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.savedBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const center = [...context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data];
    return { options: window.saveOptions, width: bitmap.width, height: bitmap.height, mime: window.savedBlob.type, closed: window.saveClosed, center };
  });
  expect(saved).toMatchObject({ options: { suggestedName: 'Thiết kế mới.png', types: [{ accept: { 'image/png': ['.png'] } }] }, width: 160, height: 90, mime: 'image/png', closed: true, center: [255, 0, 0, 255] });
  await expect(page.locator('#zoom-label')).toHaveText(previousZoom);
  await expect(page.locator('#export')).toBeEnabled();
});

test('JPEG export uses the selected extension and fills transparent areas white', async ({ page }) => {
  await page.goto('/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext('2d');
    context.fillStyle = '#22aa66';
    context.fillRect(30, 20, 20, 20);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#file-input').setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.locator('#layer-count')).toHaveText('1');
  await openExportDialog(page);
  await page.locator('#export-format').selectOption('jpeg');
  await expect(page.locator('#export-quality')).toBeEnabled();
  await page.evaluate(() => {
    window.showSaveFilePicker = async options => {
      window.saveOptions = options;
      return {
        name: options.suggestedName,
        createWritable: async () => ({
          write: async blob => { window.savedBlob = blob; },
          close: async () => {},
        }),
      };
    };
  });
  await confirmExport(page);
  await expect(page.locator('#toast')).toHaveText('Đã lưu transparent.jpg.');
  const saved = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.savedBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return {
      mime: window.savedBlob.type,
      width: bitmap.width,
      height: bitmap.height,
      corner: [...context.getImageData(0, 0, 1, 1).data],
      options: window.saveOptions,
    };
  });
  expect(saved).toMatchObject({
    mime: 'image/jpeg',
    width: 80,
    height: 60,
    options: { suggestedName: 'transparent.jpg', types: [{ accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }] },
  });
  expect(saved.corner[0]).toBeGreaterThan(250);
  expect(saved.corner[1]).toBeGreaterThan(250);
  expect(saved.corner[2]).toBeGreaterThan(250);
});

test('WebP quality setting compresses output and PNG quality remains disabled', async ({ page }) => {
  await page.goto('/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 123456789;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[index] = seed & 255;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[index + 1] = seed & 255;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[index + 2] = seed & 255;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#file-input').setInputFiles({ name: 'noise.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.locator('#layer-count')).toHaveText('1');
  await openExportDialog(page);
  await expect(page.locator('#export-quality')).toBeDisabled();
  await page.locator('#export-format').selectOption('webp');
  await expect(page.locator('#export-quality')).toBeEnabled();
  await page.evaluate(() => {
    window.savedBlobs = [];
    window.showSaveFilePicker = async options => ({
      name: options.suggestedName,
      createWritable: async () => ({
        write: async blob => { window.savedBlobs.push(blob); },
        close: async () => {},
      }),
    });
  });

  await setRange(page, '#export-quality', 20);
  await confirmExport(page);
  await expect(page.locator('#toast')).toHaveText('Đã lưu noise.webp.');
  await openExportDialog(page);
  await setRange(page, '#export-quality', 100);
  await confirmExport(page);
  await expect(page.locator('#toast')).toHaveText('Đã lưu noise.webp.');
  await expect.poll(() => page.evaluate(() => window.savedBlobs.length)).toBe(2);
  const sizes = await page.evaluate(() => window.savedBlobs.map(blob => ({ type: blob.type, size: blob.size })));
  expect(sizes[0].type).toBe('image/webp');
  expect(sizes[1].type).toBe('image/webp');
  expect(sizes[0].size).toBeLessThan(sizes[1].size);
});

test('cancel picker reports cancellation without downloading; fallback supports cancel', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-text').click();
  const downloads = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('Canceled', 'AbortError'); }; });
  await openExportDialog(page);
  await confirmExport(page);
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('Sẵn sàng chỉnh ảnh');
  await expect(page.locator('#toast')).toHaveText('Chưa lưu ảnh: thao tác bị hủy ở bước "mở hộp chọn nơi lưu". Kiểm tra Console để xem lỗi chi tiết.');
  expect(downloads).toEqual([]);
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  page.once('dialog', dialog => dialog.dismiss());
  await openExportDialog(page);
  await confirmExport(page);
  await expect(page.locator('#export')).toBeEnabled();
  expect(downloads).toEqual([]);
  page.once('dialog', dialog => dialog.accept('ảnh tôi muốn lưu'));
  const downloadPromise = page.waitForEvent('download');
  await openExportDialog(page);
  await confirmExport(page);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ảnh tôi muốn lưu.png');
  await expect(page.locator('#toast')).toHaveText('Đã tải ảnh PNG. Thư mục lưu theo thiết lập tải xuống của trình duyệt.');
});

test('iPhone export shares a PNG so it can be saved to Photos', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-text').click();
  await page.locator('#project-name').fill('Ảnh iPhone');
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => Array.isArray(data.files) && data.files[0]?.type === 'image/png' });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.sharedData = data; } });
  });

  await openExportDialog(page);
  await confirmExport(page);
  await expect(page.locator('#toast')).toHaveText('Trong menu chia sẻ, chọn Lưu hình ảnh để lưu vào Ảnh.');
  const shared = await page.evaluate(async () => {
    const file = window.sharedData.files[0];
    const bitmap = await createImageBitmap(file);
    return { name: file.name, type: file.type, width: bitmap.width, height: bitmap.height, title: window.sharedData.title };
  });
  expect(shared).toEqual({ name: 'Ảnh iPhone.png', type: 'image/png', width: 1200, height: 800, title: 'Ảnh iPhone' });
});

test('trim transparent image borders preserves transformed content, soft alpha and history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#00aa77';
    context.fillRect(10, 20, 40, 30);
    context.clearRect(20, 25, 5, 5);
    context.fillStyle = 'rgba(0, 170, 119, 0.1)';
    context.fillRect(10, 20, 1, 1);
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#file-input').setInputFiles({ name: 'padded.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.locator('#layer-count')).toHaveText('1');
  for (const [id, value] of [
    ['canvas-width', '400'], ['canvas-height', '300'],
    ['obj-width', '200'], ['obj-height', '160'],
    ['pos-x', '250'], ['pos-y', '50'], ['rotation', '90'],
  ]) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press('Tab');
  }
  await page.locator('#zoom-out').click();
  const zoom = await page.locator('#zoom-label').textContent();
  const exportBytes = async () => {
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    page.once('dialog', dialog => dialog.accept(dialog.defaultValue()));
    const downloadPromise = page.waitForEvent('download');
    await openExportDialog(page);
    await confirmExport(page);
    const png = await readFile(await (await downloadPromise).path());
    return page.evaluate(async data => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, canvas.width, canvas.height).data];
    }, png.toString('base64'));
  };
  const before = await exportBytes();
  const expectSameContentBounds = async () => {
    const after = await exportBytes();
    const bounds = pixels => {
      let left = 400, top = 300, right = -1, bottom = -1;
      for (let index = 3; index < pixels.length; index += 4) {
        if (!pixels[index]) continue;
        const x = ((index - 3) / 4) % 400;
        const y = Math.floor((index - 3) / 4 / 400);
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      return { left, top, right, bottom };
    };
    const beforeBounds = bounds(before);
    const afterBounds = bounds(after);
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      expect(Math.abs(afterBounds[edge] - beforeBounds[edge])).toBeLessThanOrEqual(1);
    }
  };
  await page.locator('#trim-transparent').click();
  await expect(page.locator('#toast')).toContainText('40 × 30 px');
  await expect(page.locator('#obj-width')).toHaveValue('80');
  await expect(page.locator('#obj-height')).toHaveValue('60');
  await expect(page.locator('#rotation')).toHaveValue('90');
  await expect(page.locator('#zoom-label')).toHaveText(zoom);
  await expect(page.locator('#canvas-width')).toHaveValue('400');
  await expect(page.locator('#canvas-height')).toHaveValue('300');
  const sourcePixels = await page.locator('.layer-thumb img').evaluate(async (thumbnail, original) => {
    const readPixels = (image, x, y, width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, x, y, width, height, 0, 0, width, height);
      return [...context.getImageData(0, 0, width, height).data];
    };
    const image = new Image();
    image.src = `data:image/png;base64,${original}`;
    await image.decode();
    await thumbnail.decode();
    return {
      expected: readPixels(image, 10, 20, 40, 30),
      actual: readPixels(thumbnail, 0, 0, 40, 30),
      width: thumbnail.naturalWidth,
      height: thumbnail.naturalHeight,
    };
  }, data);
  expect(sourcePixels.width).toBe(40);
  expect(sourcePixels.height).toBe(30);
  expect(sourcePixels.actual).toEqual(sourcePixels.expected);
  await expectSameContentBounds();
  await page.locator('#undo').click();
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('.layer-select').click();
  await expect(page.locator('#obj-width')).toHaveValue('200');
  await expect(page.locator('#obj-height')).toHaveValue('160');
  await expectSameContentBounds();
  await page.locator('#redo').click();
  await expect(page.locator('#redo')).toBeDisabled();
  await page.locator('.layer-select').click();
  await expect(page.locator('#obj-width')).toHaveValue('80');
  await expectSameContentBounds();
  await page.locator('#trim-transparent').click();
  await expect(page.locator('#toast')).toHaveText('Lớp ảnh không có viền trong suốt thừa.');
  await page.getByRole('button', { name: 'Khóa padded.png', exact: true }).click();
  await expect(page.locator('#trim-transparent')).toBeDisabled();
});

test('trimming fully transparent images reports no content without removing the layer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await upload(page, 'empty.png', 'rgba(0, 0, 0, 0)', 40, 30);
  await page.locator('#trim-transparent').click();
  await expect(page.locator('#toast')).toContainText('hoàn toàn trong suốt');
  await expect(page.locator('#obj-width')).toHaveValue('40');
  await expect(page.locator('#obj-height')).toHaveValue('30');
  await expect(page.locator('#layer-count')).toHaveText('1');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#add-text').click();
  await expect(page.locator('#trim-transparent')).toBeHidden();
});

test('background editor selects and erases connected pixels, applies to layer and supports global undo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await upload(page, 'solid.png', '#ff0000', 40, 30);
  await page.locator('#remove-background').click();
  await expect(page.locator('.background-editor')).toBeVisible();
  await expect(page.locator('#bg-remove')).toBeEnabled();
  await expect(page.locator('#bg-erase')).toBeVisible();
  await expect(page.locator('#bg-restore')).toBeVisible();
  await expect(page.locator('#bg-refine')).toBeVisible();
  await expect(page.locator('.bg-swatch')).toHaveCount(5);

  await page.locator('#bg-magic').click();
  await page.locator('#bg-canvas').click({ position: { x: 20, y: 15 } });
  await expect(page.locator('#bg-selection-count')).toHaveText('1.200 px đã chọn');
  await page.locator('#bg-undo').click();
  await expect(page.locator('#bg-selection-count')).toHaveText('0 px đã chọn');
  await page.locator('#bg-redo').click();
  await expect(page.locator('#bg-selection-count')).toHaveText('1.200 px đã chọn');
  await page.locator('#bg-remove-selection').click();
  await page.locator('#bg-apply').click();
  await expect(page.locator('.background-editor')).toBeHidden();
  await expect(page.locator('#layer-count')).toHaveText('1');
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => new Promise(resolve => {
        window.finishSavePicker = () => resolve({
          name: 'background-test.png',
          createWritable: async () => ({
            write: async blob => { window.savedBlob = blob; },
            close: async () => {},
          }),
        });
      }),
    });
  });
  const exportCenter = async () => {
    await openExportDialog(page);
    await confirmExport(page);
    await expect(page.locator('#export')).toBeDisabled();
    await page.evaluate(() => window.finishSavePicker());
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#toast')).toHaveText('Đã lưu background-test.png.');
    return page.evaluate(async () => {
      const bitmap = await createImageBitmap(window.savedBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data];
    });
  };
  expect((await exportCenter())[3]).toBe(0);

  await page.locator('#undo').click();
  await expect(page.locator('#redo')).toBeEnabled();
  expect(await exportCenter()).toEqual([255, 0, 0, 255]);
  await page.locator('#redo').click();
  expect((await exportCenter())[3]).toBe(0);
});

test('background editor brushes, restores, previews original and keeps preview background separate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await upload(page, 'brush.png', '#00aa77', 40, 30);
  await page.locator('#remove-background').click();
  const imageCanvas = page.locator('#bg-canvas');
  const bounds = await imageCanvas.boundingBox();
  await page.locator('#bg-brush-size').fill('4');
  await page.mouse.move(bounds.x + 20, bounds.y + 15);
  await page.mouse.down();
  await page.mouse.up();
  const centerAlpha = () => imageCanvas.evaluate(canvas => canvas.getContext('2d').getImageData(20, 15, 1, 1).data[3]);
  await expect.poll(centerAlpha).toBe(0);

  await page.locator('#bg-compare').check();
  await expect.poll(centerAlpha).toBe(255);
  await page.locator('#bg-compare').uncheck();
  await page.locator('#bg-restore').click();
  await page.mouse.move(bounds.x + 20, bounds.y + 15);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(centerAlpha).toBe(255);

  const darkSwatch = page.locator('.bg-swatch[data-background="#262828"]');
  await darkSwatch.click();
  await expect(darkSwatch).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#bg-feather').fill('1');
  await page.locator('#bg-contract').fill('0.5');
  await page.locator('#bg-refine').click();
  await expect(page.locator('#bg-status')).toHaveText('Đã áp dụng tinh chỉnh viền.');
  await page.locator('#bg-cancel').click();
  await expect(page.locator('.background-editor')).toBeHidden();
  expect(await page.locator('#layer-count').textContent()).toBe('1');
});