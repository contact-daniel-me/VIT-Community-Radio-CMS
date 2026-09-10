/**
 * Generate the browser tab icons from the station artwork.
 *
 *     node scripts/generate-favicons.mjs
 *
 * Source: public/brand/vit-community-radio.png -- the real logo, wordmark and
 * all. The wordmark is dropped here: at 16px it is an illegible smear, so only
 * the mic mark is cropped out, which is what stays recognisable when small.
 *
 * The mark is navy on transparency. Left that way it would vanish against a
 * dark browser tab strip, so it is composited onto a white rounded tile that
 * reads on light and dark chrome alike.
 *
 * Everything is done with node:zlib rather than sharp or ImageMagick: this runs
 * once when the artwork changes, and it is not worth a native dependency. Only
 * 8-bit non-interlaced PNGs are handled, which is what the source is.
 *
 * Committing the output is deliberate -- the build must not depend on this.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'public/brand/vit-community-radio.png');
const OUT = path.join(root, 'public');

/** How much of the tile the mark fills, and how round the tile's corners are. */
const FILL = 0.78;
const RADIUS = 0.2;
/** Sub-pixel samples per axis when masking corners, for clean antialiasing. */
const AA = 4;

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (buf[24] !== 8) throw new Error(`expected 8-bit, got ${buf[24]}`);
  if (buf[28] !== 0) throw new Error('interlaced PNGs are not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[buf[25]];
  if (!channels) throw new Error(`unsupported colour type ${buf[25]}`);

  const parts = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') parts.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const flat = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = flat.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? flat.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels;
    const d = i * 4;
    if (channels === 4) {
      rgba.set(flat.subarray(s, s + 4), d);
    } else if (channels === 3) {
      rgba.set(flat.subarray(s, s + 3), d);
      rgba[d + 3] = 255;
    } else if (channels === 2) {
      rgba.fill(flat[s], d, d + 3);
      rgba[d + 3] = flat[s + 1];
    } else {
      rgba.fill(flat[s], d, d + 3);
      rgba[d + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The mark sits above the wordmark, separated by a band of blank rows. */
function findMark(img) {
  const { width: W, height: H, rgba } = img;
  const isInk = (x, y) => {
    const i = (y * W + x) * 4;
    if (rgba[i + 3] < 32) return false;
    return 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2] < 235;
  };

  const rows = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (isInk(x, y)) rows[y]++;
  }

  const first = rows.findIndex((c) => c > 0);
  if (first < 0) throw new Error('the artwork looks blank');

  let end = H;
  let run = 0;
  let gapStart = -1;
  for (let y = first; y < H; y++) {
    if (rows[y] === 0) {
      if (run === 0) gapStart = y;
      run++;
    } else {
      if (run >= 25) {
        end = gapStart;
        break;
      }
      run = 0;
    }
  }

  let minX = W;
  let maxX = -1;
  let minY = H;
  let maxY = -1;
  for (let y = first; y < end; y++) {
    for (let x = 0; x < W; x++) {
      if (!isInk(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('could not locate the mark');
  return { minX, maxX, minY, maxY };
}

/**
 * Box-average the source square down to `size`, which is a real resample rather
 * than nearest-neighbour and is why the mark stays clean at 16px.
 */
function render(img, mark, size, { fill = FILL, radius = RADIUS } = {}) {
  const { width: W, height: H, rgba } = img;
  const markHeight = mark.maxY - mark.minY + 1;
  const side = markHeight / fill;
  const cx = (mark.minX + mark.maxX + 1) / 2;
  const cy = (mark.minY + mark.maxY + 1) / 2;
  const left = cx - side / 2;
  const top = cy - side / 2;
  const step = side / size;

  const out = Buffer.alloc(size * size * 4);
  const r = radius * size;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x0 = Math.floor(left + px * step);
      const x1 = Math.max(x0 + 1, Math.floor(left + (px + 1) * step));
      const y0 = Math.floor(top + py * step);
      const y1 = Math.max(y0 + 1, Math.floor(top + (py + 1) * step));

      let rs = 0;
      let gs = 0;
      let bs = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          n++;
          // Anything outside the mark reads as white. The tile is square and
          // the mark is not, so without this clip the top of the wordmark
          // creeps into the bottom of the icon.
          const outside =
            x < mark.minX || x > mark.maxX || y < mark.minY || y > mark.maxY;
          if (outside || x < 0 || y < 0 || x >= W || y >= H) {
            rs += 255;
            gs += 255;
            bs += 255;
            continue;
          }
          const i = (y * W + x) * 4;
          const a = rgba[i + 3] / 255;
          // Composite over white: the tile is white, and this avoids the dark
          // fringe that averaging premultiplied edges would leave.
          rs += rgba[i] * a + 255 * (1 - a);
          gs += rgba[i + 1] * a + 255 * (1 - a);
          bs += rgba[i + 2] * a + 255 * (1 - a);
        }
      }

      // Rounded-corner coverage, sampled so the curve is not stair-stepped.
      let covered = 0;
      for (let sy = 0; sy < AA; sy++) {
        for (let sx = 0; sx < AA; sx++) {
          const fx = px + (sx + 0.5) / AA;
          const fy = py + (sy + 0.5) / AA;
          const dx = Math.max(r - fx, fx - (size - r), 0);
          const dy = Math.max(r - fy, fy - (size - r), 0);
          if (dx * dx + dy * dy <= r * r) covered++;
        }
      }

      const d = (py * size + px) * 4;
      out[d] = Math.round(rs / n);
      out[d + 1] = Math.round(gs / n);
      out[d + 2] = Math.round(bs / n);
      out[d + 3] = Math.round((covered / (AA * AA)) * 255);
    }
  }
  return { width: size, height: size, rgba: out };
}

/** An ICO wrapping PNG entries -- understood by every browser still in use. */
function buildIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = header.length;
  entries.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...entries.map((entry) => entry.data)]);
}

const img = decodePng(fs.readFileSync(SOURCE));
const mark = findMark(img);
console.log(`source  ${img.width}x${img.height}`);
console.log(
  `mark    ${mark.maxX - mark.minX + 1}x${mark.maxY - mark.minY + 1} at ${mark.minX},${mark.minY}`,
);

const write = (name, buf) => {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`  ${name.padEnd(24)} ${String(buf.length).padStart(6)} bytes`);
};

for (const size of [32, 192, 512]) {
  write(`favicon-${size}.png`, encodePng(render(img, mark, size)));
}
// iOS shows this on the home screen and applies its own mask, so it is roomier
// and does no corner rounding of its own.
write('apple-touch-icon.png', encodePng(render(img, mark, 180, { fill: 0.68, radius: 0 })));
write(
  'favicon.ico',
  buildIco([16, 32, 48].map((size) => ({ size, data: encodePng(render(img, mark, size)) }))),
);
