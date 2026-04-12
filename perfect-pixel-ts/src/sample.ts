/**
 * Color sampling methods: center, median, majority (K-means K=2).
 * Reference: perfect_pixel_noCV2.py lines 178-266
 */

/** Sample the center pixel of each grid cell. */
export function sampleCenter(
  data: Uint8ClampedArray,
  w: number,
  _h: number,
  xCoords: number[],
  yCoords: number[]
): Uint8ClampedArray {
  const nx = xCoords.length - 1;
  const ny = yCoords.length - 1;
  const out = new Uint8ClampedArray(nx * ny * 4);

  for (let j = 0; j < ny; j++) {
    const cy = Math.round((yCoords[j] + yCoords[j + 1]) * 0.5);
    for (let i = 0; i < nx; i++) {
      const cx = Math.round((xCoords[i] + xCoords[i + 1]) * 0.5);
      const si = (cy * w + cx) * 4;
      const di = (j * nx + i) * 4;
      if (data[si + 3] === 0) { out[di + 3] = 0; continue; }
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

/** Sample the median color of each grid cell. */
export function sampleMedian(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  xCoords: number[],
  yCoords: number[]
): Uint8ClampedArray {
  const nx = xCoords.length - 1;
  const ny = yCoords.length - 1;
  const out = new Uint8ClampedArray(nx * ny * 4);

  for (let j = 0; j < ny; j++) {
    const y0 = Math.max(0, Math.min(h, Math.round(yCoords[j])));
    const y1 = Math.max(0, Math.min(h, Math.round(yCoords[j + 1])));
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.min(w, Math.round(xCoords[i])));
      const x1 = Math.max(0, Math.min(w, Math.round(xCoords[i + 1])));
      const pixels: number[][] = [];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * w + sx) * 4;
          if (data[si + 3] === 0) continue; // skip transparent
          pixels.push([data[si], data[si + 1], data[si + 2], data[si + 3]]);
        }
      }
      const di = (j * nx + i) * 4;
      if (pixels.length === 0) { out[di + 3] = 0; continue; }
      // Median per channel
      for (let c = 0; c < 4; c++) {
        const vals = pixels.map(p => p[c]).sort((a, b) => a - b);
        out[di + c] = vals[vals.length >> 1];
      }
    }
  }
  return out;
}

/**
 * Majority sampling: K-means K=2 per cell, pick the larger cluster.
 * This separates the intended pixel-art color from anti-aliasing artifacts.
 */
export function sampleMajority(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  xCoords: number[],
  yCoords: number[],
  maxSamples = 128,
  iters = 6
): Uint8ClampedArray {
  const nx = xCoords.length - 1;
  const ny = yCoords.length - 1;
  const out = new Uint8ClampedArray(nx * ny * 4);

  // Simple seeded PRNG (mulberry32)
  let seed = 42;
  function rand(): number {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let j = 0; j < ny; j++) {
    let y0 = Math.round(yCoords[j]);
    let y1 = Math.round(yCoords[j + 1]);
    y0 = Math.max(0, Math.min(h, y0));
    y1 = Math.max(0, Math.min(h, y1));
    if (y1 <= y0) y1 = Math.min(y0 + 1, h);

    for (let i = 0; i < nx; i++) {
      let x0 = Math.round(xCoords[i]);
      let x1 = Math.round(xCoords[i + 1]);
      x0 = Math.max(0, Math.min(w, x0));
      x1 = Math.max(0, Math.min(w, x1));
      if (x1 <= x0) x1 = Math.min(x0 + 1, w);

      // Collect cell pixels, skipping transparent ones
      const cellW = x1 - x0;
      const cellH = y1 - y0;
      const cellBuf = new Float32Array(cellW * cellH * 3);
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * w + sx) * 4;
          if (data[si + 3] === 0) continue; // skip transparent
          cellBuf[n * 3] = data[si];
          cellBuf[n * 3 + 1] = data[si + 1];
          cellBuf[n * 3 + 2] = data[si + 2];
          n++;
        }
      }
      let cell = cellBuf;

      const di = (j * nx + i) * 4;
      if (n === 0) {
        // All transparent → output transparent
        out[di + 3] = 0;
        continue;
      }

      // Subsample if too many
      if (n > maxSamples) {
        const sampled = new Float32Array(maxSamples * 3);
        for (let s = 0; s < maxSamples; s++) {
          const ri = Math.floor(rand() * n);
          sampled[s * 3] = cell[ri * 3];
          sampled[s * 3 + 1] = cell[ri * 3 + 1];
          sampled[s * 3 + 2] = cell[ri * 3 + 2];
        }
        cell = sampled;
        n = maxSamples;
      }

      // K-means K=2 initialization: c0 = first pixel, c1 = farthest from c0
      let c0r = cell[0], c0g = cell[1], c0b = cell[2];
      let c1r = c0r, c1g = c0g, c1b = c0b;
      let maxDist = 0;
      for (let p = 0; p < n; p++) {
        const dr = cell[p * 3] - c0r;
        const dg = cell[p * 3 + 1] - c0g;
        const db = cell[p * 3 + 2] - c0b;
        const d = dr * dr + dg * dg + db * db;
        if (d > maxDist) {
          maxDist = d;
          c1r = cell[p * 3]; c1g = cell[p * 3 + 1]; c1b = cell[p * 3 + 2];
        }
      }

      // K-means iterations
      let count1 = 0;
      for (let iter = 0; iter < iters; iter++) {
        let s0r = 0, s0g = 0, s0b = 0, cnt0 = 0;
        let s1r = 0, s1g = 0, s1b = 0, cnt1 = 0;

        for (let p = 0; p < n; p++) {
          const pr = cell[p * 3], pg = cell[p * 3 + 1], pb = cell[p * 3 + 2];
          const d0 = (pr - c0r) ** 2 + (pg - c0g) ** 2 + (pb - c0b) ** 2;
          const d1 = (pr - c1r) ** 2 + (pg - c1g) ** 2 + (pb - c1b) ** 2;
          if (d1 < d0) {
            s1r += pr; s1g += pg; s1b += pb; cnt1++;
          } else {
            s0r += pr; s0g += pg; s0b += pb; cnt0++;
          }
        }

        if (cnt0 > 0) { c0r = s0r / cnt0; c0g = s0g / cnt0; c0b = s0b / cnt0; }
        if (cnt1 > 0) { c1r = s1r / cnt1; c1g = s1g / cnt1; c1b = s1b / cnt1; }
        count1 = cnt1;
      }

      // Majority vote: pick the cluster with more members
      const count0 = n - count1;
      if (count1 >= count0) {
        out[di] = Math.round(Math.max(0, Math.min(255, c1r)));
        out[di + 1] = Math.round(Math.max(0, Math.min(255, c1g)));
        out[di + 2] = Math.round(Math.max(0, Math.min(255, c1b)));
      } else {
        out[di] = Math.round(Math.max(0, Math.min(255, c0r)));
        out[di + 1] = Math.round(Math.max(0, Math.min(255, c0g)));
        out[di + 2] = Math.round(Math.max(0, Math.min(255, c0b)));
      }
      out[di + 3] = 255;
    }
  }
  return out;
}
