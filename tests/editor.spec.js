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

async function exportedImage(page, targetColor) {
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  page.once('dialog', dialog => dialog.accept(dialog.defaultValue()));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
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
      value: async () => ({
        name: 'background-test.png',
        createWritable: async () => ({
          write: async blob => { window.savedBlob = blob; },
          close: async () => {},
        }),
      }),
    });
  });
  const exportCenter = async () => {
    await page.locator('#export').click();
    await expect(page.locator('#export')).toBeDisabled();
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