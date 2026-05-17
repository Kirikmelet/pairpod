import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "extension", "icons");
const sizes = [16, 48, 128];
const scale = 4;

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4));
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const highSize = size * scale;
  const pixels = new Uint8ClampedArray(highSize * highSize * 4);

  const paint = (x, y, color) => {
    if (x < 0 || y < 0 || x >= highSize || y >= highSize) {
      return;
    }
    const offset = (y * highSize + x) * 4;
    const alpha = color[3] / 255;
    const inverse = 1 - alpha;
    pixels[offset] = Math.round(color[0] * alpha + pixels[offset] * inverse);
    pixels[offset + 1] = Math.round(color[1] * alpha + pixels[offset + 1] * inverse);
    pixels[offset + 2] = Math.round(color[2] * alpha + pixels[offset + 2] * inverse);
    pixels[offset + 3] = Math.round(color[3] + pixels[offset + 3] * inverse);
  };

  const circle = (cx, cy, radius, color) => {
    const minX = Math.floor((cx - radius) * scale);
    const maxX = Math.ceil((cx + radius) * scale);
    const minY = Math.floor((cy - radius) * scale);
    const maxY = Math.ceil((cy + radius) * scale);
    const scaledCx = cx * scale;
    const scaledCy = cy * scale;
    const scaledRadius = radius * scale;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x + 0.5 - scaledCx, y + 0.5 - scaledCy);
        if (distance <= scaledRadius) {
          paint(x, y, color);
        }
      }
    }
  };

  const ellipse = (cx, cy, rx, ry, color) => {
    const minX = Math.floor((cx - rx) * scale);
    const maxX = Math.ceil((cx + rx) * scale);
    const minY = Math.floor((cy - ry) * scale);
    const maxY = Math.ceil((cy + ry) * scale);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const nx = (x + 0.5) / scale - cx;
        const ny = (y + 0.5) / scale - cy;
        if ((nx * nx) / (rx * rx) + (ny * ny) / (ry * ry) <= 1) {
          paint(x, y, color);
        }
      }
    }
  };

  const line = (x1, y1, x2, y2, width, color) => {
    const scaledWidth = (width * scale) / 2;
    const ax = x1 * scale;
    const ay = y1 * scale;
    const bx = x2 * scale;
    const by = y2 * scale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const minX = Math.floor(Math.min(ax, bx) - scaledWidth);
    const maxX = Math.ceil(Math.max(ax, bx) + scaledWidth);
    const minY = Math.floor(Math.min(ay, by) - scaledWidth);
    const maxY = Math.ceil(Math.max(ay, by) + scaledWidth);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
        const px = ax + t * dx;
        const py = ay + t * dy;
        if (Math.hypot(x - px, y - py) <= scaledWidth) {
          paint(x, y, color);
        }
      }
    }
  };

  const unit = size / 128;
  const u = (value) => value * unit;

  ellipse(u(64), u(72), u(46), u(43), [37, 112, 24, 255]);
  ellipse(u(64), u(70), u(41), u(39), [112, 190, 64, 255]);
  ellipse(u(52), u(50), u(23), u(17), [154, 226, 94, 170]);
  line(u(64), u(32), u(64), u(13), u(8), [45, 112, 24, 255]);
  circle(u(49), u(16), u(11), [140, 217, 96, 255]);
  circle(u(77), u(20), u(9), [110, 190, 68, 255]);
  circle(u(48), u(68), u(11), [255, 255, 255, 255]);
  circle(u(80), u(68), u(11), [255, 255, 255, 255]);
  circle(u(50), u(70), u(5), [26, 42, 68, 255]);
  circle(u(82), u(70), u(5), [26, 42, 68, 255]);
  line(u(49), u(92), u(57), u(98), u(5), [45, 80, 24, 255]);
  line(u(57), u(98), u(72), u(98), u(5), [45, 80, 24, 255]);
  line(u(72), u(98), u(80), u(92), u(5), [45, 80, 24, 255]);

  return downsample(highSize, pixels, size);
}

function downsample(highSize, highPixels, size) {
  const output = Buffer.alloc(size * size * 4);
  const samples = scale * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sourceOffset = ((y * scale + sy) * highSize + x * scale + sx) * 4;
          totals[0] += highPixels[sourceOffset];
          totals[1] += highPixels[sourceOffset + 1];
          totals[2] += highPixels[sourceOffset + 2];
          totals[3] += highPixels[sourceOffset + 3];
        }
      }
      const targetOffset = (y * size + x) * 4;
      output[targetOffset] = Math.round(totals[0] / samples);
      output[targetOffset + 1] = Math.round(totals[1] / samples);
      output[targetOffset + 2] = Math.round(totals[2] / samples);
      output[targetOffset + 3] = Math.round(totals[3] / samples);
    }
  }

  return output;
}

await mkdir(iconsDir, { recursive: true });

for (const size of sizes) {
  const png = createPng(size, drawIcon(size));
  await writeFile(path.join(iconsDir, `icon-${size}.png`), png);
}

console.log(`Wrote ${sizes.length} PairPod icons to ${path.relative(root, iconsDir)}`);
