/**
 * Grid line refinement: snap uniform grid lines to actual edges.
 * Reference: perfect_pixel_noCV2.py lines 156-306
 */

import { rgbToGray } from './utils';
import { sobelXY, sumAbsColumns, sumAbsRows } from './sobel';

/**
 * Find the strongest gradient peak near `origin` within [origin-rangeMin, origin+rangeMax].
 */
function findBestGrid(
  origin: number, rangeMin: number, rangeMax: number, gradMag: Float32Array
): number {
  let best = Math.round(origin);
  const peaks: [number, number][] = []; // [magnitude, position]

  for (let i = -Math.round(rangeMin); i <= Math.round(rangeMax); i++) {
    const candidate = Math.round(origin + i);
    if (candidate <= 0 || candidate >= gradMag.length - 1) continue;
    if (
      gradMag[candidate] > gradMag[candidate - 1] &&
      gradMag[candidate] > gradMag[candidate + 1]
    ) {
      peaks.push([gradMag[candidate], candidate]);
    }
  }

  if (peaks.length === 0) return best;
  peaks.sort((a, b) => b[0] - a[0]);
  return peaks[0][1];
}

/**
 * Generate refined grid coordinates by snapping to Sobel edges.
 * Returns arrays of x and y coordinates defining grid lines.
 */
export function refineGrids(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  gridW: number,
  gridH: number,
  refineIntensity = 0.25
): { xCoords: number[]; yCoords: number[] } {
  const cellW = w / gridW;
  const cellH = h / gridH;

  const gray = rgbToGray(data, w, h);
  const { gx, gy } = sobelXY(gray, w, h);
  const gradXSum = sumAbsColumns(gx, w, h);
  const gradYSum = sumAbsRows(gy, w, h);

  // Build x coordinates: start from center, expand outward
  const xCoords: number[] = [];
  let x = findBestGrid(w / 2, cellW, cellW, gradXSum);
  while (x < w + cellW / 2) {
    x = findBestGrid(x, cellW * refineIntensity, cellW * refineIntensity, gradXSum);
    xCoords.push(x);
    x += cellW;
  }
  x = findBestGrid(w / 2, cellW, cellW, gradXSum) - cellW;
  while (x > -cellW / 2) {
    x = findBestGrid(x, cellW * refineIntensity, cellW * refineIntensity, gradXSum);
    xCoords.push(x);
    x -= cellW;
  }

  const yCoords: number[] = [];
  let y = findBestGrid(h / 2, cellH, cellH, gradYSum);
  while (y < h + cellH / 2) {
    y = findBestGrid(y, cellH * refineIntensity, cellH * refineIntensity, gradYSum);
    yCoords.push(y);
    y += cellH;
  }
  y = findBestGrid(h / 2, cellH, cellH, gradYSum) - cellH;
  while (y > -cellH / 2) {
    y = findBestGrid(y, cellH * refineIntensity, cellH * refineIntensity, gradYSum);
    yCoords.push(y);
    y -= cellH;
  }

  xCoords.sort((a, b) => a - b);
  yCoords.sort((a, b) => a - b);

  return { xCoords, yCoords };
}
