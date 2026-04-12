/**
 * PerfectPixel: convert AI-generated pseudo pixel art to clean pixel art.
 *
 * Algorithm:
 *   1. Detect grid size via FFT frequency analysis (gradient fallback)
 *   2. Refine grid lines by snapping to Sobel edges
 *   3. Sample each cell with K-means K=2 majority vote
 *
 * Ported from: https://github.com/niconi19/perfectPixel (Python/NumPy)
 */

import { detectGridScale, type DetectOptions } from './detect';
import { refineGrids } from './refine';
import { sampleCenter, sampleMajority, sampleMedian } from './sample';

export interface PerfectPixelOptions {
  /** Color sampling method. Default: 'majority' */
  sampleMethod?: 'center' | 'majority' | 'median';
  /** Override auto-detection: [gridW, gridH]. null = auto-detect. */
  gridSize?: [number, number] | null;
  /** Minimum pixel size to consider valid. Default: 4 */
  minSize?: number;
  /** Peak detection width for FFT analysis. Default: 6 */
  peakWidth?: number;
  /** Grid refinement search range [0, 0.5]. Default: 0.25 */
  refineIntensity?: number;
  /** Force square output when nearly square. Default: true */
  fixSquare?: boolean;
}

export interface PerfectPixelResult {
  /** Output pixel art width (in grid cells) */
  width: number;
  /** Output pixel art height (in grid cells) */
  height: number;
  /** RGBA pixel data (width × height × 4) */
  data: Uint8ClampedArray;
}

/**
 * Convert an AI-generated pseudo pixel art image to clean pixel art.
 *
 * @param imageData - Browser ImageData (RGBA), e.g. from canvas.getContext('2d').getImageData()
 * @param options - Configuration options
 * @returns Result with dimensions and pixel data, or null if detection fails
 */
export function getPerfectPixel(
  imageData: ImageData,
  options: PerfectPixelOptions = {}
): PerfectPixelResult | null {
  const {
    sampleMethod = 'majority',
    gridSize = null,
    minSize = 4,
    peakWidth = 6,
    refineIntensity = 0.25,
    fixSquare = true,
  } = options;

  const { data, width: W, height: H } = imageData;

  // Step 1: Detect or use provided grid size
  let gridW: number, gridH: number;
  if (gridSize !== null) {
    [gridW, gridH] = gridSize;
  } else {
    const detected = detectGridScale(data, W, H, { peakWidth, minSize });
    if (detected === null) return null;
    [gridW, gridH] = detected;
  }

  // Step 2: Refine grid lines
  const { xCoords, yCoords } = refineGrids(data, W, H, gridW, gridH, refineIntensity);

  const refinedW = xCoords.length - 1;
  const refinedH = yCoords.length - 1;
  if (refinedW < 1 || refinedH < 1) return null;

  // Step 3: Sample colors
  let sampled: Uint8ClampedArray;
  if (sampleMethod === 'majority') {
    sampled = sampleMajority(data, W, H, xCoords, yCoords);
  } else if (sampleMethod === 'median') {
    sampled = sampleMedian(data, W, H, xCoords, yCoords);
  } else {
    sampled = sampleCenter(data, W, H, xCoords, yCoords);
  }

  // Step 4: Fix near-square output
  let outW = refinedW;
  let outH = refinedH;
  let outData = sampled;

  if (fixSquare && Math.abs(outW - outH) === 1) {
    const newW = Math.min(outW, outH);
    const newH = newW;
    const fixed = new Uint8ClampedArray(newW * newH * 4);
    for (let y = 0; y < newH; y++) {
      for (let x = 0; x < newW; x++) {
        const si = (y * outW + x) * 4;
        const di = (y * newW + x) * 4;
        fixed[di] = outData[si];
        fixed[di + 1] = outData[si + 1];
        fixed[di + 2] = outData[si + 2];
        fixed[di + 3] = outData[si + 3];
      }
    }
    outW = newW;
    outH = newH;
    outData = fixed;
  }

  return { width: outW, height: outH, data: outData };
}

// Re-export useful internals for advanced usage
export { detectGridScale } from './detect';
export { refineGrids } from './refine';
export { sampleCenter, sampleMajority, sampleMedian } from './sample';
