// Polyfill ImageData type for Node.js (not available outside browser)
declare class ImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray, width: number, height?: number);
  constructor(width: number, height: number);
}
