import { deflateSync } from 'node:zlib';

const WIDTH = 1024;
const HEIGHT = 1024;

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createLogoPng(background, mark, accent) {
  const rowLength = WIDTH * 4 + 1;
  const pixels = Buffer.alloc(rowLength * HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    const row = y * rowLength;
    for (let x = 0; x < WIDTH; x++) {
      const dx = x - WIDTH / 2;
      const dy = y - HEIGHT / 2;
      const radius = dx * dx + dy * dy;
      const color = radius < 210 * 210
        ? mark
        : radius < 250 * 250 && (x + y) % 32 < 5
          ? accent
          : background;
      const pixel = row + 1 + x * 4;
      pixels[pixel] = color[0];
      pixels[pixel + 1] = color[1];
      pixels[pixel + 2] = color[2];
      pixels[pixel + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // Bit depth
  header[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const logoConceptPngs = [
  {
    buffer: createLogoPng([243, 234, 219], [49, 93, 77], [238, 128, 107]),
    centerPixel: [49, 93, 77, 255],
  },
  {
    buffer: createLogoPng([232, 240, 247], [41, 85, 145], [228, 179, 63]),
    centerPixel: [41, 85, 145, 255],
  },
];
