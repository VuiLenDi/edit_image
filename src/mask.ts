export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; width: number; height: number };

export function paintSegment(mask: Uint8Array, width: number, height: number, from: Point, to: Point, diameter: number, restore: boolean, originalAlpha: Uint8Array) {
  const radius = Math.max(1, diameter / 2);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
  for (let step = 0; step <= steps; step++) {
    const centerX = from.x + (to.x - from.x) * step / steps;
    const centerY = from.y + (to.y - from.y) * step / steps;
    for (let row = Math.max(0, Math.floor(centerY - radius)); row < Math.min(height, Math.ceil(centerY + radius)); row++) {
      for (let column = Math.max(0, Math.floor(centerX - radius)); column < Math.min(width, Math.ceil(centerX + radius)); column++) {
        const coverage = Math.min(1, Math.max(0, radius - Math.hypot(column + 0.5 - centerX, row + 0.5 - centerY)));
        const index = row * width + column;
        const target = restore ? originalAlpha[index] : 0;
        mask[index] = Math.round(mask[index] + (target - mask[index]) * coverage);
      }
    }
  }
}

export function extractAlpha(pixels: Uint8ClampedArray) {
  return Uint8Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4 + 3]);
}

export function findVisibleBounds(original: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): Bounds | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      if (Math.min(original[index * 4 + 3], mask[index]) === 0) continue;
      left = Math.min(left, column);
      top = Math.min(top, row);
      right = Math.max(right, column);
      bottom = Math.max(bottom, row);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function cropRgba(pixels: Uint8ClampedArray, width: number, bounds: Bounds) {
  const cropped = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let row = 0; row < bounds.height; row++) {
    const sourceStart = ((bounds.top + row) * width + bounds.left) * 4;
    const targetStart = row * bounds.width * 4;
    cropped.set(pixels.subarray(sourceStart, sourceStart + bounds.width * 4), targetStart);
  }
  return cropped;
}

export function cropPlane(values: Uint8Array, width: number, bounds: Bounds) {
  const cropped = new Uint8Array(bounds.width * bounds.height);
  for (let row = 0; row < bounds.height; row++) {
    const sourceStart = (bounds.top + row) * width + bounds.left;
    cropped.set(values.subarray(sourceStart, sourceStart + bounds.width), row * bounds.width);
  }
  return cropped;
}

export function composite(original: Uint8ClampedArray, mask: Uint8Array, width: number, height: number, decontaminate = false) {
  const pixels = new Uint8ClampedArray(original);
  for (let index = 0; index < mask.length; index++) pixels[index * 4 + 3] = Math.min(mask[index], original[index * 4 + 3]);
  if (!decontaminate || !width || !height) return pixels;
  for (let index = 0; index < mask.length; index++) {
    const alpha = pixels[index * 4 + 3];
    const sourceAlpha = original[index * 4 + 3];
    if (!alpha || alpha >= sourceAlpha * 0.98) continue;
    const column = index % width;
    const row = Math.floor(index / width);
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let radius = 1; radius <= 4 && !weight; radius++) {
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
          const nextColumn = column + offsetX;
          const nextRow = row + offsetY;
          if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= height) continue;
          const neighbor = nextRow * width + nextColumn;
          if (original[neighbor * 4 + 3] < 250 || mask[neighbor] < 250) continue;
          const contribution = 1 / (offsetX * offsetX + offsetY * offsetY);
          red += original[neighbor * 4] * contribution;
          green += original[neighbor * 4 + 1] * contribution;
          blue += original[neighbor * 4 + 2] * contribution;
          weight += contribution;
        }
      }
    }
    if (!weight) continue;
    const amount = 1 - alpha / sourceAlpha;
    for (const [channel, color] of [red, green, blue].entries()) {
      pixels[index * 4 + channel] = Math.round(original[index * 4 + channel] * (1 - amount) + color / weight * amount);
    }
  }
  return pixels;
}

function blurAlpha(values: Uint8Array, width: number, height: number, sigma: number) {
  if (sigma <= 0) return new Uint8Array(values);
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma * sigma)));
  const total = kernel.reduce((sum, value) => sum + value, 0);
  const horizontal = new Float32Array(values.length);
  const result = new Uint8Array(values.length);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        value += values[row * width + Math.max(0, Math.min(width - 1, column + offset))] * kernel[offset + radius];
      }
      horizontal[row * width + column] = value / total;
    }
  }
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        value += horizontal[Math.max(0, Math.min(height - 1, row + offset)) * width + column] * kernel[offset + radius];
      }
      result[row * width + column] = Math.round(value / total);
    }
  }
  return result;
}

export function refineMask(mask: Uint8Array, originalAlpha: Uint8Array, width: number, height: number, feather = 0.8, contract = 0) {
  let result = mask.slice();
  const contraction = Math.max(0, Math.min(2, contract));
  for (let pass = 0; pass < Math.ceil(contraction); pass++) {
    const previous = result;
    result = previous.slice();
    const amount = Math.min(1, contraction - pass);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        let minimum = previous[index];
        for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(height - 1, row + 1); nextRow++) {
          for (let nextColumn = Math.max(0, column - 1); nextColumn <= Math.min(width - 1, column + 1); nextColumn++) {
            minimum = Math.min(minimum, previous[nextRow * width + nextColumn]);
          }
        }
        result[index] = Math.round(previous[index] + (minimum - previous[index]) * amount);
      }
    }
  }
  result = blurAlpha(result, width, height, Math.max(0, Math.min(2, feather)));
  for (let index = 0; index < result.length; index++) result[index] = Math.min(result[index], originalAlpha[index]);
  return result;
}

export function selectRegion(original: Uint8ClampedArray, mask: Uint8Array, selection: Uint8Array, width: number, height: number, point: Point, tolerance: number) {
  const column = Math.floor(point.x);
  const row = Math.floor(point.y);
  if (!Number.isFinite(column) || !Number.isFinite(row) || column < 0 || row < 0 || column >= width || row >= height) return 0;
  const seed = row * width + column;
  if (!mask[seed] || !original[seed * 4 + 3]) return 0;
  const threshold = Math.max(0, Math.min(100, tolerance)) * 255 / 100;
  const visited = new Uint8Array(mask.length);
  const queue = new Uint32Array(mask.length);
  let head = 0, tail = 0, added = 0;

  function enqueue(index: number) {
    if (visited[index]) return;
    visited[index] = 1;
    if (!mask[index] || !original[index * 4 + 3]) return;
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(original[index * 4 + channel] - original[seed * 4 + channel]) > threshold) return;
    }
    queue[tail++] = index;
  }

  enqueue(seed);
  while (head < tail) {
    const index = queue[head++];
    if (!selection[index]) {
      selection[index] = 1;
      added++;
    }
    const currentColumn = index % width;
    if (currentColumn > 0) enqueue(index - 1);
    if (currentColumn < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < width * (height - 1)) enqueue(index + width);
  }
  return added;
}

export function eraseSelection(mask: Uint8Array, selection: Uint8Array, width: number, height: number, feather = 0) {
  const coverage = feather > 0 && width && height
    ? blurAlpha(Uint8Array.from(selection, selected => selected ? 255 : 0), width, height, Math.min(2, feather))
    : null;
  for (let index = 0; index < mask.length; index++) {
    if (coverage) mask[index] = Math.round(mask[index] * (1 - coverage[index] / 255));
    else if (selection[index]) mask[index] = 0;
  }
}
