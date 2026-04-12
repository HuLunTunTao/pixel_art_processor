/**
 * Radix-2 Cooley-Tukey FFT and 2D FFT magnitude computation.
 * Reference: perfect_pixel_noCV2.py lines 78-83 compute_fft_magnitude()
 */

import { nextPow2, normalizeMinMax } from './utils';

/** In-place radix-2 FFT. Arrays must be power-of-2 length. */
function fft1d(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Compute FFT magnitude spectrum of a grayscale image.
 * Returns normalized log-magnitude: 1 - log(1 + |F|), mapped to [0,1].
 * Output dimensions are the zero-padded power-of-2 size.
 */
export function computeFFTMagnitude(
  gray: Float32Array, w: number, h: number
): { mag: Float32Array; pw: number; ph: number } {
  const pw = nextPow2(w);
  const ph = nextPow2(h);
  const N = pw * ph;

  // Zero-padded real/imag arrays
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      re[y * pw + x] = gray[y * w + x];
    }
  }

  // Row-wise FFT
  const rowRe = new Float64Array(pw);
  const rowIm = new Float64Array(pw);
  for (let y = 0; y < ph; y++) {
    const off = y * pw;
    for (let x = 0; x < pw; x++) { rowRe[x] = re[off + x]; rowIm[x] = im[off + x]; }
    fft1d(rowRe, rowIm);
    for (let x = 0; x < pw; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
  }

  // Column-wise FFT
  const colRe = new Float64Array(ph);
  const colIm = new Float64Array(ph);
  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) { colRe[y] = re[y * pw + x]; colIm[y] = im[y * pw + x]; }
    fft1d(colRe, colIm);
    for (let y = 0; y < ph; y++) { re[y * pw + x] = colRe[y]; im[y * pw + x] = colIm[y]; }
  }

  // Magnitude + fftshift + log normalization
  const mag = new Float32Array(N);
  const halfW = pw >> 1;
  const halfH = ph >> 1;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const idx = y * pw + x;
      const m = Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]);
      // fftshift: swap quadrants
      const sy = (y + halfH) % ph;
      const sx = (x + halfW) % pw;
      mag[sy * pw + sx] = 1 - Math.log1p(m);
    }
  }

  return { mag: normalizeMinMax(mag), pw, ph };
}
