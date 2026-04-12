/**
 * Grid size detection: FFT-based (primary) + gradient-based (fallback).
 * Reference: perfect_pixel_noCV2.py lines 99-409
 */

import { computeFFTMagnitude } from './fft';
import { rgbToGray, normalizeMinMax, smooth1d } from './utils';
import { sobelXY, sumAbsColumns, sumAbsRows } from './sobel';

/**
 * Detect symmetric peak pair in a 1D FFT projection.
 * Returns half the distance between left and right peaks, or null.
 */
function detectPeak(
  proj: Float32Array,
  peakWidth = 6,
  relThr = 0.35,
  minDist = 6
): number | null {
  const center = proj.length >> 1;
  let mx = 0;
  for (let i = 0; i < proj.length; i++) if (proj[i] > mx) mx = proj[i];
  if (mx < 1e-6) return null;
  const thr = mx * relThr;

  interface Candidate { index: number; score: number }
  const candidates: Candidate[] = [];

  for (let i = 1; i < proj.length - 1; i++) {
    let isPeak = true;
    for (let j = 1; j < peakWidth; j++) {
      if (i - j < 0 || i + j >= proj.length) continue;
      if (proj[i - j + 1] < proj[i - j] || proj[i + j - 1] < proj[i + j]) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak || proj[i] < thr) continue;

    let leftClimb = 0;
    for (let k = i; k > 0; k--) {
      if (proj[k] > proj[k - 1]) leftClimb = Math.abs(proj[i] - proj[k - 1]);
      else break;
    }
    let rightFall = 0;
    for (let k = i; k < proj.length - 1; k++) {
      if (proj[k] > proj[k + 1]) rightFall = Math.abs(proj[i] - proj[k + 1]);
      else break;
    }
    candidates.push({ index: i, score: Math.max(leftClimb, rightFall) });
  }

  if (candidates.length === 0) return null;

  const left = candidates
    .filter(c => c.index < center - minDist && c.index > center * 0.25)
    .sort((a, b) => b.score - a.score);
  const right = candidates
    .filter(c => c.index > center + minDist && c.index < center * 1.75)
    .sort((a, b) => b.score - a.score);

  if (left.length === 0 || right.length === 0) return null;
  return Math.abs(right[0].index - left[0].index) / 2;
}

/** FFT-based grid estimation. Returns [gridW, gridH] or null. */
function estimateGridFFT(
  gray: Float32Array, w: number, h: number, peakWidth: number
): [number, number] | null {
  const { mag, pw, ph } = computeFFTMagnitude(gray, w, h);

  // Sum columns of magnitude → row projection
  const rowSum = new Float32Array(ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      rowSum[y] += mag[y * pw + x];
    }
  }
  // Sum rows of magnitude → col projection
  const colSum = new Float32Array(pw);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      colSum[x] += mag[y * pw + x];
    }
  }

  const smoothRow = smooth1d(normalizeMinMax(rowSum), 17);
  const smoothCol = smooth1d(normalizeMinMax(colSum), 17);

  const scaleRow = detectPeak(smoothRow, peakWidth);
  const scaleCol = detectPeak(smoothCol, peakWidth);

  if (scaleRow === null || scaleCol === null || scaleCol <= 0) return null;
  return [scaleCol, scaleRow];
}

/** Gradient-based grid estimation (fallback). Returns [gridW, gridH] or null. */
function estimateGridGradient(
  gray: Float32Array, w: number, h: number
): [number, number] | null {
  const { gx, gy } = sobelXY(gray, w, h);
  const gradXSum = sumAbsColumns(gx, w, h);
  const gradYSum = sumAbsRows(gy, w, h);

  const relThr = 0.2;
  const minInterval = 4;

  function findPeaks(signal: Float32Array): number[] {
    let mx = 0;
    for (let i = 0; i < signal.length; i++) if (signal[i] > mx) mx = signal[i];
    const thr = relThr * mx;
    const peaks: number[] = [];
    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1] && signal[i] >= thr) {
        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minInterval) {
          peaks.push(i);
        }
      }
    }
    return peaks;
  }

  const peakX = findPeaks(gradXSum);
  const peakY = findPeaks(gradYSum);

  if (peakX.length < 4 || peakY.length < 4) return null;

  const intervalsX: number[] = [];
  for (let i = 1; i < peakX.length; i++) intervalsX.push(peakX[i] - peakX[i - 1]);
  const intervalsY: number[] = [];
  for (let i = 1; i < peakY.length; i++) intervalsY.push(peakY[i] - peakY[i - 1]);

  intervalsX.sort((a, b) => a - b);
  intervalsY.sort((a, b) => a - b);

  const medianX = intervalsX[intervalsX.length >> 1];
  const medianY = intervalsY[intervalsY.length >> 1];

  return [Math.round(w / medianX), Math.round(h / medianY)];
}

export interface DetectOptions {
  peakWidth?: number;
  maxRatio?: number;
  minSize?: number;
}

/** Detect grid scale: tries FFT first, falls back to gradient. */
export function detectGridScale(
  data: Uint8ClampedArray, w: number, h: number, opts: DetectOptions = {}
): [number, number] | null {
  const { peakWidth = 6, maxRatio = 1.5, minSize = 4.0 } = opts;
  const gray = rgbToGray(data, w, h);

  let grid = estimateGridFFT(gray, w, h, peakWidth);

  if (grid !== null) {
    const [gw, gh] = grid;
    const pxW = w / gw;
    const pxH = h / gh;
    const maxPixelSize = 20;
    if (
      Math.min(pxW, pxH) < minSize ||
      Math.max(pxW, pxH) > maxPixelSize ||
      pxW / pxH > maxRatio ||
      pxH / pxW > maxRatio
    ) {
      grid = null; // FFT result failed sanity check
    }
  }

  if (grid === null) {
    grid = estimateGridGradient(gray, w, h);
  }

  if (grid === null) return null;

  const [gw, gh] = grid;
  const pxW = w / gw;
  const pxH = h / gh;

  let pixelSize: number;
  if (pxW / pxH > maxRatio || pxH / pxW > maxRatio) {
    pixelSize = Math.min(pxW, pxH);
  } else {
    pixelSize = (pxW + pxH) / 2;
  }

  return [Math.round(w / pixelSize), Math.round(h / pixelSize)];
}
