import { removeBackground } from '@imgly/background-removal';
import { createIcons, icons } from 'lucide';
import {
  composite,
  eraseSelection,
  extractAlpha,
  paintSegment,
  refineMask,
  selectRegion,
  type Point,
} from './mask';

type Mode = 'erase' | 'restore' | 'magic';
type HistoryEntry = {
  mask: Uint8Array;
  selection: Uint8Array;
  mode: Mode;
  decontaminate: boolean;
  compareOriginal: boolean;
};

const icon = (name: string) => `<i data-lucide="${name}"></i>`;

function createDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'background-editor';
  dialog.setAttribute('aria-labelledby', 'bg-title');
  dialog.innerHTML = `
    <header class="bg-header">
      <div><h2 id="bg-title">Tách nền lớp ảnh</h2><p id="bg-layer-name"></p></div>
      <button id="bg-close" class="icon-button" type="button" aria-label="Đóng">${icon('x')}</button>
    </header>
    <div class="bg-content">
      <div class="bg-preview">
        <div class="bg-stage" id="bg-stage">
          <canvas id="bg-canvas" aria-label="Ảnh đang tinh chỉnh nền"></canvas>
          <span id="bg-brush-cursor" hidden></span>
        </div>
        <p class="bg-caption">Ảnh không tải lên máy chủ. Lần đầu dùng AI cần tải mô hình từ CDN.</p>
      </div>
      <aside class="bg-controls">
        <section class="bg-section">
          <div class="bg-section-title"><span>01</span><h3>Tách nền tự động</h3><span class="bg-ai">AI</span></div>
          <button id="bg-remove" class="button primary bg-full">${icon('wand-sparkles')} Xóa phông nền</button>
          <p id="bg-model-note" class="bg-note">Mô hình AI chạy trên thiết bị của bạn.</p>
        </section>
        <section class="bg-section">
          <div class="bg-section-title"><span>02</span><h3>Tinh chỉnh chi tiết</h3></div>
          <div class="bg-tool-grid">
            <button id="bg-erase" class="bg-tool active" type="button" aria-pressed="true">${icon('eraser')}<span>Xóa thêm</span></button>
            <button id="bg-restore" class="bg-tool" type="button" aria-pressed="false">${icon('paintbrush')}<span>Khôi phục</span></button>
            <button id="bg-magic" class="bg-tool" type="button" aria-pressed="false">${icon('wand')}<span>Magic · Chọn vùng</span></button>
          </div>
          <div id="bg-brush-controls">
            <div class="bg-range-heading"><label for="bg-brush-size">Kích thước cọ</label><output id="bg-brush-label">40 px</output></div>
            <input id="bg-brush-size" type="range" min="4" max="180" value="40" />
          </div>
          <div id="bg-magic-controls" hidden>
            <div class="bg-range-heading"><label for="bg-tolerance">Ngưỡng màu</label><output id="bg-tolerance-label">15%</output></div>
            <input id="bg-tolerance" type="range" min="0" max="100" value="15" />
            <div class="bg-selection-heading"><output id="bg-selection-count">0 px đã chọn</output><button id="bg-clear-selection" class="icon-button" type="button" title="Bỏ chọn tất cả" aria-label="Bỏ chọn tất cả">${icon('x')}</button></div>
            <button id="bg-remove-selection" class="button bg-secondary bg-full" type="button">${icon('trash-2')} Xóa vùng đã chọn</button>
          </div>
          <div class="bg-range-heading bg-refine-heading"><label for="bg-feather">Mềm viền</label><output id="bg-feather-label">0,8 px</output></div>
          <input id="bg-feather" type="range" min="0" max="2" step="0.1" value="0.8" />
          <div class="bg-range-heading"><label for="bg-contract">Co viền</label><output id="bg-contract-label">0 px</output></div>
          <input id="bg-contract" type="range" min="0" max="2" step="0.25" value="0" />
          <label class="bg-switch"><span>Khử ám màu viền</span><input id="bg-decontaminate" type="checkbox" checked /><span class="bg-switch-ui"></span></label>
          <button id="bg-refine" class="button bg-secondary bg-full" type="button">${icon('scan-line')} Áp dụng tinh chỉnh viền</button>
          <button id="bg-reset" class="bg-link" type="button">${icon('rotate-ccw')} Đặt lại về ảnh gốc / kết quả AI</button>
        </section>
        <section class="bg-section">
          <div class="bg-section-title"><h3>Nền xem trước</h3><span class="bg-only">CHỈ XEM</span></div>
          <div class="bg-swatches" role="group" aria-label="Màu nền xem trước">
            <button class="bg-swatch bg-checker selected" data-background="transparent" type="button" aria-label="Trong suốt" aria-pressed="true"></button>
            <button class="bg-swatch bg-white" data-background="#ffffff" type="button" aria-label="Trắng" aria-pressed="false"></button>
            <button class="bg-swatch bg-black" data-background="#262828" type="button" aria-label="Đen" aria-pressed="false"></button>
            <button class="bg-swatch bg-green" data-background="#dce9d4" type="button" aria-label="Xanh lá" aria-pressed="false"></button>
            <button class="bg-swatch bg-coral" data-background="#efc6bc" type="button" aria-label="Hồng" aria-pressed="false"></button>
          </div>
          <label class="bg-compare"><input id="bg-compare" type="checkbox" /> Xem ảnh gốc</label>
        </section>
        <section class="bg-section bg-history">
          <button id="bg-undo" class="button bg-secondary" type="button">${icon('undo-2')} Hoàn tác</button>
          <button id="bg-redo" class="button bg-secondary" type="button">${icon('redo-2')} Làm lại</button>
        </section>
      </aside>
    </div>
    <footer class="bg-footer">
      <div class="bg-progress" aria-live="polite"><progress id="bg-progress" max="100" hidden></progress><span id="bg-status">Chỉnh sửa mặt nạ rồi áp dụng để cập nhật lớp ảnh.</span></div>
      <div class="bg-actions"><button id="bg-cancel" class="button bg-secondary" type="button">Hủy</button><button id="bg-apply" class="button primary" type="button">${icon('check')} Áp dụng vào lớp</button></div>
    </footer>`;
  document.body.append(dialog);
  createIcons({ icons });
  return dialog;
}

export function editImageBackground(pixels: Uint8ClampedArray, width: number, height: number, layerName: string): Promise<Blob | null> {
  if (width < 1 || height < 1 || width * height > 16_000_000) {
    return Promise.reject(new Error('Tách nền hỗ trợ ảnh tối đa 16 megapixel.'));
  }

  const dialog = createDialog();
  const canvas = dialog.querySelector<HTMLCanvasElement>('#bg-canvas')!;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const stage = dialog.querySelector<HTMLElement>('#bg-stage')!;
  const cursor = dialog.querySelector<HTMLElement>('#bg-brush-cursor')!;
  const status = dialog.querySelector<HTMLElement>('#bg-status')!;
  const progress = dialog.querySelector<HTMLProgressElement>('#bg-progress')!;
  const initialAlpha = extractAlpha(pixels);
  let mask = initialAlpha.slice();
  let baseline = mask.slice();
  let selection = new Uint8Array(mask.length);
  let selectedCount = 0;
  let mode: Mode = 'erase';
  let decontaminate = true;
  let compareOriginal = false;
  let stroke: Point | null = null;
  let busy = false;
  let history: HistoryEntry[] = [];
  let historyIndex = -1;
  let previewBackground = '';
  let result: Blob | null = null;

  canvas.width = width;
  canvas.height = height;
  dialog.querySelector<HTMLElement>('#bg-layer-name')!.textContent = layerName;

  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const button = (id: string) => get<HTMLButtonElement>(id);
  const input = (id: string) => get<HTMLInputElement>(id);
  const output = (id: string) => get<HTMLOutputElement>(id);
  const values = (): HistoryEntry => ({
    mask: mask.slice(),
    selection: selection.slice(),
    mode,
    decontaminate,
    compareOriginal,
  });
  const updateHistory = () => {
    button('bg-undo').disabled = busy || historyIndex <= 0;
    button('bg-redo').disabled = busy || historyIndex >= history.length - 1;
  };
  const updateControls = () => {
    dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.bg-controls button, .bg-controls input').forEach(control => {
      control.disabled = busy;
    });
    button('bg-close').disabled = busy;
    button('bg-cancel').disabled = busy;
    button('bg-apply').disabled = busy;
    button('bg-remove-selection').disabled = busy || selectedCount === 0;
    button('bg-undo').disabled = busy || historyIndex <= 0;
    button('bg-redo').disabled = busy || historyIndex >= history.length - 1;
    output('bg-selection-count').textContent = `${selectedCount.toLocaleString('vi-VN')} px đã chọn`;
    output('bg-brush-label').textContent = `${input('bg-brush-size').value} px`;
    output('bg-tolerance-label').textContent = `${input('bg-tolerance').value}%`;
    output('bg-feather-label').textContent = `${Number(input('bg-feather').value).toLocaleString('vi-VN')} px`;
    output('bg-contract-label').textContent = `${Number(input('bg-contract').value).toLocaleString('vi-VN')} px`;
    updateHistory();
    render();
  };
  function render() {
    const frame = compareOriginal ? new Uint8ClampedArray(pixels) : composite(pixels, mask, width, height, decontaminate);
    if (!compareOriginal && selectedCount > 0) {
      for (let index = 0; index < selection.length; index++) {
        if (!selection[index]) continue;
        const offset = index * 4;
        frame[offset] = Math.round(frame[offset] * 0.35 + 255 * 0.65);
        frame[offset + 1] = Math.round(frame[offset + 1] * 0.35 + 137 * 0.65);
        frame[offset + 2] = Math.round(frame[offset + 2] * 0.35 + 60 * 0.65);
        frame[offset + 3] = Math.max(frame[offset + 3], 180);
      }
    }
    context.putImageData(new ImageData(frame, width, height), 0, 0);
    stage.style.backgroundColor = previewBackground;
    cursor.hidden = busy || compareOriginal || mode === 'magic';
  }
  const commit = () => {
    history = history.slice(0, historyIndex + 1);
    history.push(values());
    historyIndex = history.length - 1;
    const maxBytes = 48 * 1024 * 1024;
    while (history.length > 12 || (history.length > 2 && history.reduce((total, entry) => total + entry.mask.byteLength + entry.selection.byteLength, 0) > maxBytes)) history.shift();
    historyIndex = history.length - 1;
    updateControls();
  };
  const restoreHistory = (direction: -1 | 1) => {
    const nextIndex = historyIndex + direction;
    if (busy || nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    const snapshot = history[historyIndex];
    mask = snapshot.mask.slice();
    selection = snapshot.selection.slice();
    selectedCount = selection.reduce((count, selected) => count + selected, 0);
    mode = snapshot.mode;
    decontaminate = snapshot.decontaminate;
    compareOriginal = snapshot.compareOriginal;
    input('bg-decontaminate').checked = decontaminate;
    input('bg-compare').checked = compareOriginal;
    setMode(mode);
    status.textContent = direction < 0 ? 'Đã hoàn tác thay đổi.' : 'Đã làm lại thay đổi.';
    updateControls();
  };
  function setMode(nextMode: Mode) {
    mode = nextMode;
    for (const name of ['erase', 'restore', 'magic'] as const) {
      const selected = name === mode;
      button(`bg-${name}`).classList.toggle('active', selected);
      button(`bg-${name}`).setAttribute('aria-pressed', String(selected));
    }
    get<HTMLElement>('bg-brush-controls').hidden = mode === 'magic';
    get<HTMLElement>('bg-magic-controls').hidden = mode !== 'magic';
    cursor.hidden = busy || compareOriginal || mode === 'magic';
    render();
  }
  const point = (event: PointerEvent): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * width / bounds.width, y: (event.clientY - bounds.top) * height / bounds.height };
  };
  const setBusy = (value: boolean) => {
    busy = value;
    progress.hidden = !value;
    if (!value) progress.value = 0;
    updateControls();
  };
  const makeBlob = (data: Uint8ClampedArray) => new Promise<Blob | null>(resolve => {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const imageData = new ImageData(width, height);
    imageData.data.set(data);
    target.getContext('2d')!.putImageData(imageData, 0, 0);
    target.toBlob(blob => {
      target.width = 0;
      target.height = 0;
      resolve(blob);
    }, 'image/png');
  });

  const resetSelection = () => {
    selection = new Uint8Array(mask.length);
    selectedCount = 0;
  };

  button('bg-close').addEventListener('click', () => dialog.close());
  button('bg-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    if (busy) event.preventDefault();
  });
  for (const name of ['erase', 'restore', 'magic'] as const) button(`bg-${name}`).addEventListener('click', () => setMode(name));

  button('bg-remove').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Đang chuẩn bị mô hình tách nền…';
    try {
      const source = await makeBlob(pixels);
      if (!source) throw new Error('Không thể chuẩn bị dữ liệu ảnh để tách nền.');
      const { removeBackground } = await import('@imgly/background-removal');
      const cutout = await removeBackground(source, {
        model: 'isnet_fp16',
        output: { format: 'image/png' },
        progress: (key: string, current: number, total: number) => {
          status.textContent = key.startsWith('fetch:')
            ? 'Đang tải mô hình AI về thiết bị…'
            : key === 'compute:inference'
              ? 'AI đang nhận diện chủ thể…'
              : 'Đang xử lý ảnh…';
          if (total > 0) {
            progress.value = Math.max(0, Math.min(100, current / total * 100));
          } else {
            progress.removeAttribute('value');
          }
        },
      });
      const bitmap = await createImageBitmap(cutout);
      if (bitmap.width !== width || bitmap.height !== height) {
        bitmap.close();
        throw new Error('Kích thước kết quả tách nền không khớp với ảnh gốc.');
      }
      const target = document.createElement('canvas');
      target.width = width;
      target.height = height;
      const targetContext = target.getContext('2d', { willReadFrequently: true })!;
      targetContext.drawImage(bitmap, 0, 0);
      bitmap.close();
      baseline = extractAlpha(targetContext.getImageData(0, 0, width, height).data);
      target.width = 0;
      target.height = 0;
      mask = baseline.slice();
      resetSelection();
      history = [];
      historyIndex = -1;
      status.textContent = 'Đã tách nền. Dùng cọ hoặc Magic để tinh chỉnh rồi áp dụng vào lớp.';
      commit();
    } catch (error) {
      console.error(error);
      status.textContent = `Không thể tách nền: ${error instanceof Error ? error.message : 'đã xảy ra lỗi không xác định.'}`;
      updateControls();
    } finally {
      setBusy(false);
    }
  });

  button('bg-clear-selection').addEventListener('click', () => {
    if (!selectedCount || busy) return;
    resetSelection();
    status.textContent = 'Đã bỏ chọn vùng.';
    commit();
  });
  button('bg-remove-selection').addEventListener('click', () => {
    if (!selectedCount || busy || compareOriginal) return;
    const nextMask = mask.slice();
    eraseSelection(nextMask, selection, width, height, Number(input('bg-feather').value));
    mask = nextMask;
    resetSelection();
    status.textContent = 'Đã xóa vùng chọn và làm mềm viền.';
    commit();
  });
  button('bg-refine').addEventListener('click', () => {
    if (busy || compareOriginal) return;
    mask = refineMask(mask, initialAlpha, width, height, Number(input('bg-feather').value), Number(input('bg-contract').value));
    resetSelection();
    status.textContent = 'Đã áp dụng tinh chỉnh viền.';
    commit();
  });
  button('bg-reset').addEventListener('click', () => {
    if (busy || compareOriginal) return;
    mask = baseline.slice();
    resetSelection();
    status.textContent = 'Đã đặt lại về kết quả gần nhất.';
    commit();
  });
  button('bg-undo').addEventListener('click', () => restoreHistory(-1));
  button('bg-redo').addEventListener('click', () => restoreHistory(1));
  input('bg-brush-size').addEventListener('input', updateControls);
  input('bg-tolerance').addEventListener('input', updateControls);
  input('bg-feather').addEventListener('input', updateControls);
  input('bg-contract').addEventListener('input', updateControls);
  input('bg-decontaminate').addEventListener('change', () => {
    decontaminate = input('bg-decontaminate').checked;
    commit();
  });
  input('bg-compare').addEventListener('change', () => {
    compareOriginal = input('bg-compare').checked;
    render();
    updateHistory();
  });
  dialog.querySelectorAll<HTMLButtonElement>('.bg-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      previewBackground = swatch.dataset.background === 'transparent' ? '' : swatch.dataset.background || '';
      dialog.querySelectorAll('.bg-swatch').forEach(item => {
        item.classList.toggle('selected', item === swatch);
        item.setAttribute('aria-pressed', String(item === swatch));
      });
      render();
    });
  });

  canvas.addEventListener('pointerdown', event => {
    if (busy || compareOriginal || event.button !== 0) return;
    event.preventDefault();
    const location = point(event);
    if (mode === 'magic') {
      const nextSelection = selection.slice();
      const added = selectRegion(pixels, mask, nextSelection, width, height, location, Number(input('bg-tolerance').value));
      if (!added) {
        status.textContent = 'Không tìm thấy vùng liền kề đủ tương đồng.';
        return;
      }
      selection = nextSelection;
      selectedCount += added;
      status.textContent = 'Vùng được đánh dấu. Bấm “Xóa vùng đã chọn” để áp dụng.';
      commit();
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    stroke = location;
    paintSegment(mask, width, height, stroke, stroke, Number(input('bg-brush-size').value), mode === 'restore', initialAlpha);
    render();
  });
  canvas.addEventListener('pointermove', event => {
    const bounds = stage.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const brushSize = Number(input('bg-brush-size').value) * canvasBounds.width / width;
    cursor.hidden = busy || compareOriginal || mode === 'magic';
    cursor.style.width = cursor.style.height = `${brushSize}px`;
    cursor.style.left = `${event.clientX - bounds.left}px`;
    cursor.style.top = `${event.clientY - bounds.top}px`;
    if (!stroke) return;
    const next = point(event);
    paintSegment(mask, width, height, stroke, next, Number(input('bg-brush-size').value), mode === 'restore', initialAlpha);
    stroke = next;
    render();
  });
  const finishStroke = () => {
    if (!stroke) return;
    stroke = null;
    status.textContent = mode === 'restore' ? 'Đã khôi phục vùng được tô.' : 'Đã xóa vùng được tô.';
    commit();
  };
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(eventName, finishStroke);
  canvas.addEventListener('pointerleave', () => { cursor.hidden = true; });

  button('bg-apply').addEventListener('click', async () => {
    if (busy || stroke) return;
    setBusy(true);
    status.textContent = 'Đang tạo ảnh PNG trong suốt…';
    try {
      result = await makeBlob(composite(pixels, mask, width, height, decontaminate));
      if (!result) throw new Error('Không thể tạo ảnh PNG.');
      dialog.close();
    } catch (error) {
      console.error(error);
      status.textContent = `Không thể áp dụng chỉnh sửa: ${error instanceof Error ? error.message : 'đã xảy ra lỗi không xác định.'}`;
      setBusy(false);
    }
  });

  commit();
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    }, { once: true });
  });
}
