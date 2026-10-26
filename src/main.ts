import { ActiveSelection, Canvas, FabricImage, FabricObject, Textbox } from 'fabric';
import { createIcons, icons } from 'lucide';
import { editImageBackground } from './background-editor';
import './style.css';

type Layer = FabricObject & { layerName?: string };
type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'center-both';
const alignments: Alignment[] = ['left', 'center', 'right', 'top', 'middle', 'bottom', 'center-both'];
type Snapshot = { scene: object; width: number; height: number; name: string };
type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;
};
FabricObject.customProperties = ['layerName'];
FabricObject.ownDefaults = { ...FabricObject.ownDefaults, cornerColor: '#087f69', borderColor: '#087f69', cornerStrokeColor: '#ffffff', cornerSize: 10, transparentCorners: false, padding: 3 };

const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const tool = (id: string, name: string, title: string) => `<button id="${id}" class="icon-button" title="${title}" aria-label="${title}">${icon(name)}</button>`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="Lớp - trang chính"><span class="brand-symbol">${icon('layers-2')}</span><span>Lớp<span class="brand-dot">.</span></span></a>
    <span class="header-divider"></span><input id="project-name" aria-label="Tên ảnh" value="Ảnh chưa đặt tên" maxlength="100" />
    <span class="local-badge">${icon('shield-check')} Chỉ trên thiết bị</span>
    <button id="export" class="button primary">${icon('download')}<span>Tải PNG</span></button>
  </header>
  <nav class="toolbar" aria-label="Công cụ chỉnh ảnh">
    <div class="tool-group"><button id="upload" class="button" aria-label="Thêm ảnh" title="Thêm ảnh">${icon('image-plus')}<span>Thêm ảnh</span></button><button id="paste" class="button" aria-label="Dán ảnh hoặc chữ" title="Dán ảnh hoặc chữ">${icon('clipboard-paste')}<span>Dán</span></button><button id="add-text" class="button" aria-label="Thêm chữ" title="Thêm chữ">${icon('type')}<span>Thêm chữ</span></button></div>
    <div class="tool-group history-tools">${tool('undo', 'undo-2', 'Hoàn tác (Ctrl+Z)')}${tool('redo', 'redo-2', 'Làm lại (Ctrl+Shift+Z)')}<span class="toolbar-divider"></span>${tool('duplicate', 'copy', 'Nhân bản lớp (Ctrl+D)')}${tool('delete', 'trash-2', 'Xóa lớp (Delete)')}</div>
    <div class="mobile-tabs">${tool('show-layers', 'layers', 'Danh sách lớp')}${tool('show-properties', 'sliders-horizontal', 'Thuộc tính')}</div>
  </nav>
  <main class="editor">
    <aside class="sidebar layers-panel" aria-label="Danh sách lớp">
      <div class="panel-title"><h2>Lớp ảnh</h2><span id="layer-count" class="count">0</span></div>
      <div id="layers" class="layer-list"></div>
      <div id="no-layers" class="no-layers">${icon('layers-2')}<span>Chưa có lớp nào</span></div>
      <div class="layer-footer">${tool('raise', 'arrow-up', 'Đưa lớp lên trên')}${tool('lower', 'arrow-down', 'Đưa lớp xuống dưới')}<span class="spacer"></span>${tool('add-layer', 'plus', 'Thêm lớp ảnh')}</div>
      <section class="layer-alignment" aria-label="Canh chỉnh lớp">
        <label for="alignment-target">Canh theo</label><select id="alignment-target"><option value="selection">Các lớp đang chọn</option><option value="canvas">Khung ảnh</option></select>
        <div class="layer-align-tools">${tool('align-layers-left', 'align-horizontal-justify-start', 'Canh trái các lớp')}${tool('align-layers-center', 'align-horizontal-justify-center', 'Canh giữa ngang các lớp')}${tool('align-layers-right', 'align-horizontal-justify-end', 'Canh phải các lớp')}${tool('align-layers-top', 'align-vertical-justify-start', 'Canh trên các lớp')}${tool('align-layers-middle', 'align-vertical-justify-center', 'Canh giữa dọc các lớp')}${tool('align-layers-bottom', 'align-vertical-justify-end', 'Canh dưới các lớp')}</div>
        <button id="align-layers-center-both" class="button align-canvas-center" title="Đặt từng lớp vào chính giữa khung ảnh">${icon('crosshair')} Chính giữa khung ảnh</button>
      </section>
      <section class="document-section"><h2>Khung ảnh</h2><div class="two-fields"><label>Rộng <span>px</span><input id="canvas-width" type="number" min="1" max="8192" value="1200" /></label><label>Cao <span>px</span><input id="canvas-height" type="number" min="1" max="8192" value="800" /></label></div><label class="background-row">Nền ảnh <input id="background" type="color" value="#ffffff" aria-label="Màu nền ảnh" /></label><label class="checkbox-row"><input id="transparent" type="checkbox" checked /> Nền trong suốt</label></section>
    </aside>
    <section class="workspace" aria-label="Vùng chỉnh ảnh">
      <div class="workspace-heading"><span id="document-label">Ảnh chưa đặt tên</span><span id="dimensions">1200 × 800 px</span></div>
      <div id="viewport" class="viewport"><div id="canvas-shell" class="canvas-shell"><canvas id="canvas"></canvas><button id="resize-east" class="canvas-resize-handle resize-east" data-axis="x" type="button" title="Kéo để đổi chiều rộng khung" aria-label="Kéo để đổi chiều rộng khung"></button><button id="resize-south" class="canvas-resize-handle resize-south" data-axis="y" type="button" title="Kéo để đổi chiều cao khung" aria-label="Kéo để đổi chiều cao khung"></button><button id="resize-corner" class="canvas-resize-handle resize-corner" data-axis="xy" type="button" title="Kéo để đổi chiều rộng và cao khung" aria-label="Kéo để đổi chiều rộng và cao khung"></button></div>
        <div id="empty-state" class="empty-state"><div class="empty-art">${icon('image-plus')}<span class="art-plus">+</span></div><h1>Bức ảnh của bạn,<br />theo cách của bạn.</h1><button id="first-upload" class="button primary">${icon('upload')} Chọn ảnh gốc</button><span class="paste-separator">hoặc</span><button id="first-paste" class="paste-link">${icon('clipboard-paste')} Dán ảnh từ clipboard</button><span class="file-formats">PNG, JPG, WebP · Kéo thả ảnh vào đây</span></div>
      </div>
      <footer class="workspace-footer"><span id="selection-label">Chưa chọn lớp</span><div class="zoom-tools">${tool('zoom-out', 'minus', 'Thu nhỏ')}<output id="zoom-label">100%</output>${tool('zoom-in', 'plus', 'Phóng to')}<span class="toolbar-divider"></span>${tool('fit', 'maximize', 'Vừa khung')}</div></footer>
    </section>
    <aside class="sidebar properties-panel" aria-label="Thuộc tính">
      <div class="panel-title"><h2>Thuộc tính</h2>${icon('sliders-horizontal')}</div>
      <div id="nothing-selected" class="nothing-selected">${icon('mouse-pointer-2')}<p>Chưa chọn đối tượng</p></div>
      <div id="properties" hidden>
        <section class="property-section"><label>Tên lớp<input id="layer-name" type="text" maxlength="100" /></label><div class="two-fields"><label>X<input id="pos-x" type="number" /></label><label>Y<input id="pos-y" type="number" /></label></div><div class="two-fields"><label>Rộng <span>px</span><input id="obj-width" type="number" min="1" /></label><label>Cao <span>px</span><input id="obj-height" type="number" min="1" /></label></div><label>Xoay <span>°</span><input id="rotation" type="number" min="-360" max="360" /></label><label class="range-label">Độ trong suốt <output id="opacity-value">100%</output><input id="opacity" type="range" min="0" max="100" value="100" /></label></section>
        <section id="image-properties" class="property-section" hidden><h2>Tách nền</h2><button id="remove-background" class="button background-tool" type="button">${icon('wand-sparkles')} Tách nền AI</button><p class="background-tool-note">Tách nền, dùng cọ/Magic tinh chỉnh và áp dụng trực tiếp vào lớp ảnh.</p></section>
        <section id="text-properties" class="property-section" hidden><h2>Văn bản</h2><label>Nội dung<textarea id="text-content" rows="3"></textarea></label><label>Phông chữ<select id="font-family"><option value="Arial, Helvetica, sans-serif">Arial</option><option value="Verdana, Geneva, sans-serif">Verdana</option><option value="Tahoma, Geneva, sans-serif">Tahoma</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option><option value="Georgia, serif">Georgia</option><option value="'Times New Roman', Times, serif">Times New Roman</option><option value="'Palatino Linotype', 'Book Antiqua', Palatino, serif">Palatino</option><option value="'Courier New', Courier, monospace">Courier New</option><option value="'Lucida Console', Monaco, monospace">Lucida Console</option><option value="Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif">Impact</option><option value="system-ui, sans-serif">System UI</option><option value="ui-serif, Georgia, serif">UI Serif</option><option value="ui-monospace, 'Courier New', monospace">UI Monospace</option></select></label><div class="two-fields"><label>Cỡ chữ<input id="font-size" type="number" min="1" max="1000" /></label><label>Màu chữ<input id="text-color" type="color" value="#172b29" /></label></div><label>Mã màu HEX<input id="text-hex" type="text" value="#172b29" placeholder="#172b29" spellcheck="false" autocomplete="off" aria-label="Mã màu HEX" /></label><div class="text-tools">${tool('bold', 'bold', 'Chữ đậm')}${tool('italic', 'italic', 'Chữ nghiêng')}${tool('underline', 'underline', 'Gạch chân')}<span class="toolbar-divider"></span>${tool('align-left', 'align-left', 'Căn trái')}${tool('align-center', 'align-center', 'Căn giữa')}${tool('align-right', 'align-right', 'Căn phải')}</div></section>
      </div>
      <div class="panel-bottom"><span class="status-dot"></span><span id="status" role="status" aria-live="polite">Sẵn sàng chỉnh ảnh</span></div>
    </aside>
  </main>
  <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp" multiple hidden />
  <div id="toast" role="alert" hidden></div>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const on = (id: string, callback: () => void) => element(id).addEventListener('click', callback);
const refreshIcons = () => {
  createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
  document.querySelectorAll('svg[data-lucide]').forEach(svg => svg.removeAttribute('data-lucide'));
};
const canvas = new Canvas('canvas', { width: 1200, height: 800, preserveObjectStacking: true, selection: false });
let documentWidth = 1200;
let documentHeight = 800;
let zoom = 1;
let busy = false;
let history: Snapshot[] = [];
let historyIndex = -1;
let toastTimer: ReturnType<typeof setTimeout>;
let selectionAnchorIndex = -1;
let resizeDrag: { pointerId: number; startX: number; startY: number; startWidth: number; startHeight: number; startZoom: number; axes: string } | null = null;
const active = () => canvas.getActiveObject() as Layer | undefined;
const isText = (object: FabricObject | undefined): object is Textbox => object instanceof Textbox;
const selectedObjects = () => {
  const object = canvas.getActiveObject();
  return object instanceof ActiveSelection ? object.getObjects() as Layer[] : object ? [object as Layer] : [];
};
function setSelectedObjects(objects: Layer[]) {
  const selectable = objects.filter(object => object.selectable && canvas.getObjects().includes(object));
  canvas.discardActiveObject();
  if (selectable.length === 1) canvas.setActiveObject(selectable[0]);
  else if (selectable.length > 1) canvas.setActiveObject(new ActiveSelection(selectable, { canvas }));
}
const notify = (message: string) => {
  element('toast').textContent = message;
  element('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element('toast').hidden = true; }, 4500);
};
const reportError = (error: unknown) => { console.error(error); notify('Không thể xử lý ảnh. Hãy chọn ảnh PNG, JPG hoặc WebP hợp lệ.'); };
function updateHistoryButtons() {
  input('undo').disabled = busy || historyIndex <= 0;
  input('redo').disabled = busy || historyIndex >= history.length - 1;
}
function record() {
  if (busy) return;
  const snapshot: Snapshot = { scene: canvas.toJSON(), width: documentWidth, height: documentHeight, name: input('project-name').value };
  const previous = history[historyIndex];
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 25) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}
async function restore(direction: number) {
  const next = historyIndex + direction;
  if (busy || next < 0 || next >= history.length) return;
  busy = true;
  updateHistoryButtons();
  try {
    const snapshot = history[next];
    await canvas.loadFromJSON(snapshot.scene);
    documentWidth = snapshot.width;
    documentHeight = snapshot.height;
    input('project-name').value = snapshot.name;
    historyIndex = next;
    fit();
  } catch (error) { reportError(error); }
  finally { busy = false; render(); updateHistoryButtons(); }
}
function setZoom(value: number) {
  zoom = Math.max(0.02, Math.min(4, value));
  canvas.setDimensions({ width: Math.round(documentWidth * zoom), height: Math.round(documentHeight * zoom) });
  canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
  element('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
}
function fit() {
  const viewport = element('viewport');
  setZoom(Math.min((viewport.clientWidth - 64) / documentWidth, (viewport.clientHeight - 64) / documentHeight, 1));
}
function renderLayers() {
  const container = element('layers');
  container.replaceChildren();
  const objects = canvas.getObjects() as Layer[];
  const selected = selectedObjects();
  element('layer-count').textContent = String(objects.length);
  element('no-layers').hidden = objects.length > 0;
  [...objects].reverse().forEach((object, reverseIndex) => {
    const row = document.createElement('div');
    row.className = `layer-row${selected.includes(object) ? ' selected' : ''}${!object.visible ? ' muted' : ''}`;
    const select = document.createElement('button');
    select.className = 'layer-select';
    select.type = 'button';
    select.title = 'Chọn lớp. Ctrl/Cmd hoặc Shift + nhấp để chọn nhiều lớp.';
    select.setAttribute('aria-pressed', String(selected.includes(object)));
    const thumbnail = document.createElement('span');
    thumbnail.className = 'layer-thumb';
    if (object instanceof FabricImage) {
      const image = document.createElement('img');
      image.src = object.getSrc();
      image.alt = '';
      thumbnail.append(image);
    } else thumbnail.innerHTML = icon('type');
    const caption = document.createElement('span');
    caption.className = 'layer-caption';
    const name = document.createElement('strong');
    name.textContent = object.layerName || 'Lớp';
    const kind = document.createElement('small');
    kind.textContent = isText(object) ? 'Văn bản' : 'Hình ảnh';
    caption.append(name, kind);
    select.append(thumbnail, caption);
    select.addEventListener('click', event => {
      if (busy) return;
      const ordered = [...objects].reverse();
      let next: Layer[];
      if (event.shiftKey && selectionAnchorIndex >= 0) {
        const start = Math.min(selectionAnchorIndex, reverseIndex);
        const end = Math.max(selectionAnchorIndex, reverseIndex);
        next = ordered.slice(start, end + 1).filter(layer => layer.selectable);
      } else if (event.ctrlKey || event.metaKey) {
        next = selectedObjects();
        next = next.includes(object) ? next.filter(layer => layer !== object) : [...next, object];
        selectionAnchorIndex = reverseIndex;
      } else {
        next = [object];
        selectionAnchorIndex = reverseIndex;
      }
      setSelectedObjects(next);
      canvas.requestRenderAll();
      render();
    });
    row.append(select);
    const toggle = (name: string, title: string, action: () => void) => {
      const button = document.createElement('button');
      button.className = 'icon-button layer-action';
      button.title = title;
      button.setAttribute('aria-label', `${title} ${object.layerName || 'Lớp'}`);
      button.innerHTML = icon(name);
      button.onclick = () => { if (busy) return; action(); canvas.requestRenderAll(); record(); render(); };
      row.append(button);
    };
    toggle(object.selectable ? 'lock-open' : 'lock', object.selectable ? 'Khóa' : 'Mở khóa', () => {
      const locked = object.selectable;
      object.set({ selectable: !locked, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, editable: !locked });
      canvas.discardActiveObject();
    });
    toggle(object.visible ? 'eye' : 'eye-off', object.visible ? 'Ẩn' : 'Hiện', () => { object.set('visible', !object.visible); canvas.discardActiveObject(); });
    row.dataset.index = String(objects.length - 1 - reverseIndex);
    container.append(row);
  });
}
function renderProperties() {
  const objects = selectedObjects();
  const object = objects.length === 1 ? objects[0] : undefined;
  element('properties').hidden = !object;
  element('nothing-selected').hidden = !!object;
  element('nothing-selected').querySelector('p')!.textContent = objects.length > 1 ? `${objects.length} lớp được chọn` : 'Chưa chọn đối tượng';
  element('selection-label').textContent = objects.length > 1 ? `${objects.length} lớp được chọn` : object?.layerName || 'Chưa chọn lớp';
  input('duplicate').disabled = objects.length !== 1 || busy;
  input('delete').disabled = objects.length === 0 || busy;
  element('image-properties').hidden = !(object instanceof FabricImage);
  (element('remove-background') as HTMLButtonElement).disabled = !(object instanceof FabricImage) || busy || !object.selectable;
  for (const id of ['raise', 'lower']) input(id).disabled = objects.length !== 1 || busy;
  const alignToCanvas = element<HTMLSelectElement>('alignment-target').value === 'canvas';
  for (const alignment of alignments) {
    element<HTMLButtonElement>(`align-layers-${alignment}`).disabled = busy || objects.some(layer => !layer.selectable) || objects.length < (alignToCanvas ? 1 : 2) || (alignment === 'center-both' && !alignToCanvas);
  }
  element('align-layers-center-both').hidden = !alignToCanvas;
  if (!object) return;
  const values: Record<string, string | number> = {
    'layer-name': object.layerName || '', 'pos-x': Math.round(object.left), 'pos-y': Math.round(object.top),
    'obj-width': Math.round(object.getScaledWidth()), 'obj-height': Math.round(object.getScaledHeight()),
    rotation: Math.round(object.angle), opacity: Math.round(object.opacity * 100),
  };
  for (const [id, value] of Object.entries(values)) if (document.activeElement !== element(id)) input(id).value = String(value);
  element('opacity-value').textContent = `${Math.round(object.opacity * 100)}%`;
  element('text-properties').hidden = !isText(object);
  if (isText(object)) {
    const textValues = { 'text-content': object.text, 'font-family': object.fontFamily, 'font-size': String(object.fontSize), 'text-color': String(object.fill), 'text-hex': String(object.fill) };
    for (const [id, value] of Object.entries(textValues)) if (document.activeElement !== element(id)) input(id).value = value;
    if (document.activeElement !== input('text-hex')) input('text-hex').setAttribute('aria-invalid', 'false');
    element('bold').classList.toggle('active', object.fontWeight === 'bold');
    element('italic').classList.toggle('active', object.fontStyle === 'italic');
    element('underline').classList.toggle('active', object.underline);
    for (const alignment of ['left', 'center', 'right']) element(`align-${alignment}`).classList.toggle('active', object.textAlign === alignment);
  }
}
function render() {
  renderLayers();
  renderProperties();
  const empty = canvas.getObjects().length === 0;
  element('empty-state').hidden = !empty;
  element('canvas-shell').classList.toggle('is-empty', empty);
  input('canvas-width').value = String(documentWidth);
  input('canvas-height').value = String(documentHeight);
  input('transparent').checked = !canvas.backgroundColor;
  if (canvas.backgroundColor) input('background').value = String(canvas.backgroundColor);
  element('dimensions').textContent = `${documentWidth} × ${documentHeight} px`;
  element('document-label').textContent = input('project-name').value || 'Ảnh chưa đặt tên';
  input('export').disabled = empty || busy;
  element('status').textContent = busy ? 'Đang xử lý...' : 'Sẵn sàng chỉnh ảnh';
  refreshIcons();
}
function changeObject(update: (object: Layer) => void, save = true) {
  const object = active();
  if (!object || busy || !object.selectable) return;
  update(object);
  object.setCoords();
  canvas.requestRenderAll();
  if (save) record();
  render();
}
function alignSelected(alignment: Alignment) {
  const objects = selectedObjects();
  const alignToCanvas = element<HTMLSelectElement>('alignment-target').value === 'canvas';
  if (busy || objects.length < (alignToCanvas ? 1 : 2) || objects.some(object => !object.selectable) || (alignment === 'center-both' && !alignToCanvas)) return;
  canvas.discardActiveObject();
  const bounds = objects.map(object => object.getBoundingRect());
  const horizontal = alignment === 'left' || alignment === 'center' || alignment === 'right' || alignment === 'center-both';
  const vertical = alignment === 'top' || alignment === 'middle' || alignment === 'bottom' || alignment === 'center-both';
  const leftEdge = alignToCanvas ? 0 : Math.min(...bounds.map(bound => bound.left));
  const rightEdge = alignToCanvas ? documentWidth : Math.max(...bounds.map(bound => bound.left + bound.width));
  const topEdge = alignToCanvas ? 0 : Math.min(...bounds.map(bound => bound.top));
  const bottomEdge = alignToCanvas ? documentHeight : Math.max(...bounds.map(bound => bound.top + bound.height));
  const targetX = alignment === 'left' ? leftEdge : alignment === 'right' ? rightEdge : (leftEdge + rightEdge) / 2;
  const targetY = alignment === 'top' ? topEdge : alignment === 'bottom' ? bottomEdge : (topEdge + bottomEdge) / 2;
  objects.forEach((object, index) => {
    const bound = bounds[index];
    const edgeX = alignment === 'left' ? bound.left : alignment === 'right' ? bound.left + bound.width : bound.left + bound.width / 2;
    const edgeY = alignment === 'top' ? bound.top : alignment === 'bottom' ? bound.top + bound.height : bound.top + bound.height / 2;
    if (horizontal) object.set('left', object.left + targetX - edgeX);
    if (vertical) object.set('top', object.top + targetY - edgeY);
    object.setCoords();
  });
  setSelectedObjects(objects);
  canvas.requestRenderAll();
  record();
  render();
}
async function importImages(files: File[]) {
  if (busy) { notify('Vui lòng chờ ảnh hiện tại xử lý xong.'); return; }
  const images = files.filter(file => file.type.startsWith('image/'));
  if (!images.length) { notify('Hãy chọn hoặc dán một tệp hình ảnh.'); return; }
  busy = true;
  render();
  updateHistoryButtons();
  try {
    for (const file of images) {
      if (file.size > 30 * 1024 * 1024) { notify('Ảnh quá lớn. Vui lòng dùng tệp dưới 30 MB.'); continue; }
      const url = URL.createObjectURL(file);
      try {
        const image = await FabricImage.fromURL(url);
        const first = canvas.getObjects().length === 0;
        if (image.width > 8192 || image.height > 8192 || image.width * image.height > 32_000_000) { notify('Ảnh quá lớn. Giới hạn 8192 px mỗi chiều và 32 triệu pixel.'); continue; }
        if (first) {
          documentWidth = image.width;
          documentHeight = image.height;
          input('project-name').value = file.name.replace(/\.[^.]+$/, '') || 'Ảnh của tôi';
        }
        image.scale(first ? 1 : Math.min(documentWidth * 0.65 / image.width, documentHeight * 0.65 / image.height, 1));
        image.set({ originX: 'left', originY: 'top', left: (documentWidth - image.getScaledWidth()) / 2, top: (documentHeight - image.getScaledHeight()) / 2 });
        const persistentImage = document.createElement('img');
        persistentImage.src = image.toDataURL({ format: 'png', multiplier: 1 / image.scaleX });
        await persistentImage.decode();
        image.setElement(persistentImage);
        (image as Layer).layerName = file.name || `Ảnh ${canvas.getObjects().length + 1}`;
        canvas.add(image);
        canvas.setActiveObject(image);
      } finally { URL.revokeObjectURL(url); }
    }
    fit();
  } catch (error) { reportError(error); }
  finally { busy = false; record(); render(); updateHistoryButtons(); }
}
async function pasteClipboard() {
  if (!navigator.clipboard?.read) { notify('Hãy dùng Ctrl+V (hoặc Cmd+V) để dán ảnh hoặc chữ đã sao chép.'); return; }
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find(value => value.startsWith('image/'));
      if (type) files.push(new File([await item.getType(type)], 'Ảnh đã dán.png', { type }));
    }
    if (files.length) await importImages(files);
    else {
      const textItem = items.find(item => item.types.includes('text/plain'));
      const text = textItem ? await (await textItem.getType('text/plain')).text() : '';
      if (text.trim()) addText(text);
      else notify('Clipboard chưa có ảnh hoặc chữ.');
    }
  } catch { notify('Không đọc được clipboard. Hãy dùng Ctrl+V (hoặc Cmd+V) để dán ảnh hoặc chữ.'); }
}
function addText(content = 'Nhập nội dung của bạn') {
  if (busy) return;
  const text = new Textbox(content, { originX: 'left', originY: 'top', left: documentWidth * 0.15, top: documentHeight * 0.2, width: documentWidth * 0.7, fontSize: Math.max(12, Math.round(documentWidth / 24)), fontFamily: 'Arial, Helvetica, sans-serif', fill: '#172b29' });
  (text as Layer).layerName = 'Văn bản mới';
  canvas.add(text);
  canvas.setActiveObject(text);
  record();
  render();
  if (window.innerWidth < 1050) document.body.dataset.panel = 'properties';
  input('text-content').focus();
  input('text-content').select();
}
async function editSelectedBackground() {
  const objects = selectedObjects();
  const object = objects.length === 1 && objects[0] instanceof FabricImage ? objects[0] : undefined;
  if (!object || busy || !object.selectable) return;
  if (object.width > 8192 || object.height > 8192 || object.width * object.height > 16_000_000) {
    notify('Tách nền hỗ trợ ảnh tối đa 16 megapixel và 8192 px mỗi chiều.');
    return;
  }

  busy = true;
  render();
  updateHistoryButtons();
  let applied = false;
  try {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = object.width;
    sourceCanvas.height = object.height;
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Không thể khởi tạo vùng đọc ảnh.');
    context.drawImage(object.getElement(), 0, 0, object.width, object.height);
    const pixels = context.getImageData(0, 0, object.width, object.height).data;
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    const result = await editImageBackground(pixels, object.width, object.height, (object as Layer).layerName || 'Lớp ảnh');
    if (!result) return;
    const reader = new FileReader();
    const imageUrl = await new Promise<string>((resolve, reject) => {
      reader.onerror = () => reject(reader.error || new Error('Không thể đọc ảnh PNG đã xử lý.'));
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Định dạng ảnh PNG không hợp lệ.'));
      reader.readAsDataURL(result);
    });
    const processedImage = new Image();
    processedImage.src = imageUrl;
    await processedImage.decode();
    object.setElement(processedImage);
    object.setCoords();
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    applied = true;
  } catch (error) {
    reportError(error);
  } finally {
    busy = false;
    if (applied) record();
    render();
    updateHistoryButtons();
  }
}
function remove() {
  const objects = selectedObjects();
  if (!objects.length || busy || objects.some(object => !object.selectable)) return;
  canvas.discardActiveObject();
  canvas.remove(...objects);
  canvas.discardActiveObject();
  record();
  render();
}
on('remove-background', () => { void editSelectedBackground(); });
async function duplicate() {
  const objects = selectedObjects();
  const object = objects.length === 1 ? objects[0] : undefined;
  if (!object || busy) return;
  busy = true;
  try {
    const copy = await object.clone() as Layer;
    copy.set({ left: object.left + 20, top: object.top + 20 });
    copy.layerName = `${object.layerName || 'Lớp'} (bản sao)`;
    canvas.add(copy);
    canvas.setActiveObject(copy);
  } catch (error) { reportError(error); }
  finally { busy = false; record(); render(); }
}
async function exportPng() {
  if (busy || !canvas.getObjects().length) return;
  try {
    const pngName = (name: string) => `${name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\.png$/i, '') || 'anh-da-chinh'}.png`;
    let filename = pngName(input('project-name').value);
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    let handle: FileSystemFileHandle | undefined;
    busy = true;
    render();
    updateHistoryButtons();
    if (picker) {
      handle = await picker.call(window, { suggestedName: filename, types: [{ description: 'Ảnh PNG', accept: { 'image/png': ['.png'] } }] });
    } else {
      const name = window.prompt('Tên tệp PNG:', filename);
      if (name === null) return;
      filename = pngName(name);
    }
    const previewZoom = zoom;
    let url: string;
    try {
      setZoom(1);
      url = canvas.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: false, width: documentWidth, height: documentHeight });
    } finally { setZoom(previewZoom); }
    if (handle) {
      const blob = await (await fetch(url)).blob();
      const writable = await handle.createWritable();
      try { await writable.write(blob); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
      notify(`Đã lưu ${handle.name}.`);
    } else {
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      notify('Đã tải PNG. Thư mục lưu theo thiết lập tải xuống của trình duyệt.');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    notify('Không thể lưu PNG. Hãy kiểm tra quyền lưu tệp hoặc thử trình duyệt Chrome/Edge.');
  } finally { busy = false; render(); updateHistoryButtons(); }
}
for (const id of ['upload', 'first-upload', 'add-layer']) on(id, () => input('file-input').click());
for (const id of ['paste', 'first-paste']) on(id, () => { void pasteClipboard(); });
input('file-input').addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  void importImages(Array.from(target.files || []));
  target.value = '';
});
on('add-text', () => addText());
on('delete', remove);
on('duplicate', () => { void duplicate(); });
on('undo', () => { void restore(-1); });
on('redo', () => { void restore(1); });
on('export', exportPng);
on('raise', () => changeObject(object => { canvas.bringObjectForward(object); }));
on('lower', () => changeObject(object => { canvas.sendObjectBackwards(object); }));
for (const alignment of alignments) on(`align-layers-${alignment}`, () => alignSelected(alignment));
element('alignment-target').addEventListener('change', renderProperties);
on('zoom-in', () => setZoom(zoom * 1.2));
on('zoom-out', () => setZoom(zoom / 1.2));
on('fit', fit);
on('show-layers', () => { document.body.dataset.panel = document.body.dataset.panel === 'layers' ? '' : 'layers'; });
on('show-properties', () => { document.body.dataset.panel = document.body.dataset.panel === 'properties' ? '' : 'properties'; });
input('project-name').addEventListener('input', () => { element('document-label').textContent = input('project-name').value || 'Ảnh chưa đặt tên'; });
input('project-name').addEventListener('change', record);
input('layer-name').addEventListener('change', () => changeObject(object => { object.layerName = input('layer-name').value.trim() || 'Lớp'; }));
const numeric = (id: string, update: (object: Layer, value: number) => void, min = -100000, max = 100000) => {
  input(id).addEventListener('change', () => {
    const value = input(id).valueAsNumber;
    if (!Number.isFinite(value)) { render(); return; }
    changeObject(object => update(object, Math.max(min, Math.min(max, value))));
  });
};
numeric('pos-x', (object, value) => object.set('left', value));
numeric('pos-y', (object, value) => object.set('top', value));
numeric('rotation', (object, value) => object.rotate(value), -360, 360);
numeric('obj-width', (object, value) => object.scaleToWidth(value), 1, 16384);
numeric('obj-height', (object, value) => object.scaleToHeight(value), 1, 16384);
numeric('font-size', (object, value) => { if (isText(object)) object.set('fontSize', value); }, 1, 1000);
input('opacity').addEventListener('input', () => changeObject(object => object.set('opacity', Number(input('opacity').value) / 100), false));
input('opacity').addEventListener('change', record);
input('text-content').addEventListener('input', () => changeObject(object => { if (isText(object)) object.set('text', input('text-content').value); }, false));
input('text-content').addEventListener('change', record);
element('font-family').addEventListener('change', () => changeObject(object => { if (isText(object)) object.set('fontFamily', input('font-family').value); }));
input('text-color').addEventListener('input', () => changeObject(object => object.set('fill', input('text-color').value), false));
input('text-color').addEventListener('change', record);
function hexColor(value: string) {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  return `#${hex.length === 3 ? [...hex].map(character => character.repeat(2)).join('') : hex}`.toLowerCase();
}
input('text-hex').addEventListener('input', () => {
  const color = hexColor(input('text-hex').value);
  input('text-hex').setAttribute('aria-invalid', String(!color));
  if (color) changeObject(object => { object.set('fill', color); input('text-color').value = color; }, false);
});
input('text-hex').addEventListener('change', () => {
  const color = hexColor(input('text-hex').value);
  if (!color) { notify('Mã màu không hợp lệ. Hãy nhập #RGB hoặc #RRGGBB.'); return; }
  input('text-hex').value = color;
  record();
});
on('bold', () => changeObject(object => { if (isText(object)) object.set('fontWeight', object.fontWeight === 'bold' ? 'normal' : 'bold'); }));
on('italic', () => changeObject(object => { if (isText(object)) object.set('fontStyle', object.fontStyle === 'italic' ? 'normal' : 'italic'); }));
on('underline', () => changeObject(object => { if (isText(object)) object.set('underline', !object.underline); }));
for (const alignment of ['left', 'center', 'right']) on(`align-${alignment}`, () => changeObject(object => { if (isText(object)) object.set('textAlign', alignment); }));
for (const id of ['canvas-width', 'canvas-height']) input(id).addEventListener('change', () => {
  if (busy) return;
  const width = input('canvas-width').valueAsNumber;
  const height = input('canvas-height').valueAsNumber;
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 8192) || width * height > 32_000_000) {
    notify('Khung ảnh cần từ 1–8192 px mỗi chiều, tối đa 32 triệu pixel.'); render(); return;
  }
  documentWidth = width;
  documentHeight = height;
  fit(); record(); render();
});
input('transparent').addEventListener('change', () => { if (busy) return; canvas.backgroundColor = input('transparent').checked ? '' : input('background').value; canvas.requestRenderAll(); record(); });
input('background').addEventListener('input', () => { if (busy) return; input('transparent').checked = false; canvas.backgroundColor = input('background').value; canvas.requestRenderAll(); });
input('background').addEventListener('change', record);
document.addEventListener('paste', event => {
  const text = event.clipboardData?.getData('text/plain') || '';
  const target = event.target as HTMLElement;
  if (text && target.closest('input, textarea, [contenteditable="true"]')) return;
  const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
  if (files.length) { event.preventDefault(); void importImages(files); }
  else if (text.trim()) { event.preventDefault(); addText(text); }
});
const viewport = element('viewport');
document.querySelectorAll<HTMLButtonElement>('.canvas-resize-handle').forEach(handle => {
  handle.addEventListener('pointerdown', event => {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    resizeDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth: documentWidth, startHeight: documentHeight, startZoom: zoom, axes: handle.dataset.axis || '' };
    handle.setPointerCapture(event.pointerId);
  });
});
window.addEventListener('pointermove', event => {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
  const width = resizeDrag.axes.includes('x') ? Math.round(resizeDrag.startWidth + (event.clientX - resizeDrag.startX) / resizeDrag.startZoom) : resizeDrag.startWidth;
  const height = resizeDrag.axes.includes('y') ? Math.round(resizeDrag.startHeight + (event.clientY - resizeDrag.startY) / resizeDrag.startZoom) : resizeDrag.startHeight;
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32_000_000) return;
  documentWidth = width;
  documentHeight = height;
  setZoom(resizeDrag.startZoom);
  input('canvas-width').value = String(width);
  input('canvas-height').value = String(height);
  element('dimensions').textContent = `${width} × ${height} px`;
});
function finishCanvasResize(event: PointerEvent) {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
  const changed = documentWidth !== resizeDrag.startWidth || documentHeight !== resizeDrag.startHeight;
  resizeDrag = null;
  if (changed) record();
  render();
}
window.addEventListener('pointerup', finishCanvasResize);
window.addEventListener('pointercancel', finishCanvasResize);
viewport.addEventListener('dragover', event => { event.preventDefault(); viewport.classList.add('dragover'); });
viewport.addEventListener('dragleave', event => { if (!viewport.contains(event.relatedTarget as Node)) viewport.classList.remove('dragover'); });
viewport.addEventListener('drop', event => { event.preventDefault(); viewport.classList.remove('dragover'); void importImages(Array.from(event.dataTransfer?.files || [])); });
document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (target.matches('input, textarea, select, [contenteditable="true"]') || (isText(active()) && (active() as Textbox).isEditing)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); void restore(event.shiftKey ? 1 : -1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); void restore(1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); void duplicate(); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
  if (event.key === 'Escape') { selectionAnchorIndex = -1; canvas.discardActiveObject(); canvas.requestRenderAll(); render(); document.body.dataset.panel = ''; }
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (offsets[event.key] && active()) {
    event.preventDefault();
    const [deltaX, deltaY] = offsets[event.key];
    const step = event.shiftKey ? 10 : 1;
    changeObject(object => object.set({ left: object.left + deltaX * step, top: object.top + deltaY * step }));
  }
});
canvas.on('selection:created', render);
canvas.on('selection:updated', render);
canvas.on('selection:cleared', render);
canvas.on('object:modified', () => { record(); render(); });
canvas.on('text:changed', () => { renderProperties(); });
canvas.on('text:editing:exited', () => { record(); render(); });
new ResizeObserver(fit).observe(viewport);
document.fonts.ready.then(() => { for (const object of canvas.getObjects()) if (isText(object)) object.initDimensions(); canvas.requestRenderAll(); });
fit();
record();
render();