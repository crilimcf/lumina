#!/usr/bin/env node
/**
 * Gera os ícones da app sem dependências: buffer RGBA feito pixel a pixel
 * (gradientes e círculos via matemática de distância), comprimido com
 * zlib (já vem no Node) e escrito como PNG cru (IHDR/IDAT/IEND, CRC32 e
 * Adler32 à mão). O mesmo truque da vez anterior, desenho novo.
 *
 * Conceito: "amanhecer da comunidade" — quadrado arredondado com o
 * gradiente real da marca (cobalto → coral, o mesmo dos halos usados no
 * resto da app), um círculo de luz grande deslocado para o canto (o "sol"
 * do dia novo, ligação direta ao nome Lumina) e um segundo círculo mais
 * pequeno, sobreposto — duas pessoas, uma comunidade pequena.
 */
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

const COBALT = [43, 43, 247];
const CORAL = [255, 84, 66];
const CREAM = [255, 250, 240];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

function roundedRectMask(x, y, size, radius) {
  const cx = Math.min(x, size - 1 - x, radius);
  const cy = Math.min(y, size - 1 - y, radius);
  if (x >= radius && x <= size - 1 - radius) return 1;
  if (y >= radius && y <= size - 1 - radius) return 1;
  const dx = radius - cx, dy = radius - cy;
  return Math.sqrt(dx * dx + dy * dy) <= radius ? 1 : 0;
}

function generate(size) {
  const radius = Math.round(size * 0.22);
  const pixels = Buffer.alloc(size * size * 4);

  // Ícones "maskable" (Android) recortam para além de ~80% do centro — os
  // dois círculos ficam dentro dessa zona segura, mesmo que o fundo vá
  // até à borda.
  // sol: círculo grande de luz, deslocado para cima/direita
  const sunCx = size * 0.62, sunCy = size * 0.38, sunR = size * 0.22;
  // segunda "pessoa": círculo mais pequeno, sobreposto por baixo/esquerda
  const moonCx = size * 0.36, moonCy = size * 0.64, moonR = size * 0.13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inRounded = roundedRectMask(x, y, size, radius);

      // gradiente diagonal cobalto → coral, base do quadrado
      const t = (x + y) / (2 * size);
      let color = mix(COBALT, CORAL, t);

      // sol: disco cremoso com desvanecimento suave na borda (glow)
      const dSun = Math.hypot(x - sunCx, y - sunCy);
      if (dSun < sunR) {
        const edge = Math.max(0, Math.min(1, (sunR - dSun) / (size * 0.05)));
        color = mix(color, CREAM, 0.94 * edge);
      } else if (dSun < sunR + size * 0.09) {
        const glow = 1 - (dSun - sunR) / (size * 0.09);
        color = mix(color, CREAM, 0.22 * glow);
      }

      // segunda esfera: cor sólida cobalto-escuro, sobreposta, com aro fino cor de creme
      const dMoon = Math.hypot(x - moonCx, y - moonCy);
      if (dMoon < moonR) {
        color = mix(COBALT, [20, 16, 60], 0.35);
      } else if (dMoon < moonR + size * 0.018) {
        color = CREAM;
      }

      const a = inRounded ? 255 : 0;
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = a;
    }
  }

  // filtro de linha 0 (nenhum) antes de cada scanline, exigido pelo formato PNG
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // profundidade de cor
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const png = generate(size);
  const path = `icon-${size}.png`;
  writeFileSync(path, png);
  console.log(`gerado ${path} (${png.length} bytes)`);
}
