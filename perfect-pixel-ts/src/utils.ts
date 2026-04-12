/**
 * Utility functions: grayscale conversion, normalization, smoothing.
 * Reference: perfect_pixel_noCV2.py lines 7-96
 */

/** RGBA ImageData → grayscale Float32Array */
export function rgbToGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return gray;
}

/** Normalize array to [0, 1] */
export function normalizeMinMax(arr: Float32Array): Float32Array {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  const out = new Float32Array(arr.length);
  const range = mx - mn;
  if (range < 1e-8) return out;
  for (let i = 0; i < arr.length; i++) {
    out[i] = (arr[i] - mn) / range;
  }
  return out;
}

/** 1D Gaussian smoothing */
export function smooth1d(v: Float32Array, k = 17): Float32Array {
  if (k < 3) return new Float32Array(v);
  if (k % 2 === 0) k++;
  const sigma = k / 6;
  const half = k >> 1;
  const kernel = new Float32Array(k);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < k; i++) kernel[i] /= sum;

  const n = v.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) {
      let idx = i + j - half;
      if (idx < 0) idx = 0;
      if (idx >= n) idx = n - 1;
      s += kernel[j] * v[idx];
    }
    out[i] = s;
  }
  return out;
}

/** Next power of 2 >= n */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
