/**
 * Sobel edge detection (3×3 kernel).
 * Reference: perfect_pixel_noCV2.py lines 45-71
 */

/** 3×3 Sobel gradient. Returns gx (horizontal) and gy (vertical). */
export function sobelXY(
  gray: Float32Array, w: number, h: number
): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];

      gx[y * w + x] = -tl + tr - 2 * ml + 2 * mr - bl + br;
      gy[y * w + x] = -tl - 2 * tc - tr + bl + 2 * bc + br;
    }
  }
  return { gx, gy };
}

/** Absolute gradient sum per column (axis=0) */
export function sumAbsColumns(grad: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x] += Math.abs(grad[y * w + x]);
    }
  }
  return out;
}

/** Absolute gradient sum per row (axis=1) */
export function sumAbsRows(grad: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y] += Math.abs(grad[y * w + x]);
    }
  }
  return out;
}
