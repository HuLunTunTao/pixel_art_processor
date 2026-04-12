import sharp from 'sharp';
import { getPerfectPixel, type PerfectPixelOptions } from 'perfect-pixel-ts';

function printUsage() {
  console.log(`用法: perfect-pixel <input> [options]

参数:
  input                输入图片路径

选项:
  -o, --output <path>  输出路径 (默认: <input>_pixel.png)
  -m, --method <name>  采样方法: majority | center | median (默认: majority)
  -s, --size <WxH>     手动指定网格大小, 如 32x32 (默认: 自动检测)
  --scale <n>          输出放大倍数 (默认: 1, 即原始像素大小)
  -h, --help           显示帮助`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let input = '';
  let output = '';
  let method: 'center' | 'majority' | 'median' = 'majority';
  let gridSize: [number, number] | null = null;
  let scale = 1;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--output') { output = args[++i]; }
    else if (a === '-m' || a === '--method') { method = args[++i] as typeof method; }
    else if (a === '-s' || a === '--size') {
      const parts = args[++i].split('x').map(Number);
      gridSize = [parts[0], parts[1]];
    }
    else if (a === '--scale') { scale = Number(args[++i]); }
    else if (!a.startsWith('-')) { input = a; }
  }

  if (!input) { console.error('错误: 请指定输入文件'); process.exit(1); }
  if (!output) {
    const dot = input.lastIndexOf('.');
    output = (dot > 0 ? input.slice(0, dot) : input) + '_pixel.png';
  }

  const img = sharp(input).ensureAlpha();
  const meta = await img.metadata();
  const width = meta.width!;
  const height = meta.height!;
  const rawBuf = await img.raw().toBuffer();

  console.log(`输入: ${input} (${width}x${height})`);

  const imageData = {
    data: new Uint8ClampedArray(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength),
    width,
    height,
  } as ImageData;

  const opts: PerfectPixelOptions = { sampleMethod: method, gridSize };
  const result = getPerfectPixel(imageData, opts);

  if (!result) {
    console.error('检测失败: 未能识别像素网格');
    process.exit(1);
  }

  console.log(`检测网格: ${result.width}x${result.height}`);
  console.log(`采样方法: ${method}`);

  const outWidth = result.width * scale;
  const outHeight = result.height * scale;

  let out = sharp(Buffer.from(result.data.buffer), {
    raw: { width: result.width, height: result.height, channels: 4 },
  });

  if (scale > 1) {
    out = out.resize(outWidth, outHeight, { kernel: 'nearest' });
  }

  await out.png().toFile(output);
  console.log(`输出: ${output} (${outWidth}x${outHeight})`);
}

main().catch(e => { console.error(e); process.exit(1); });
