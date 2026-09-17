// Глазик — один рисунок для иконки приложения и значка в трее.
// Рисуется попиксельно со сглаживанием (4×4 выборки на пиксель), без библиотек.

const IRIS = {
  calm:  [0x6F, 0x8F, 0x5E],   // зелёная, как у мягких глаз
  warm:  [0xC0, 0x8A, 0x3E],   // 1–2 переноса
  angry: [0xC4, 0x55, 0x3F],   // 3 и больше
};
const OUTLINE = [0x2F, 0x3D, 0x33];
const WHITE = [0xFB, 0xF8, 0xEF];
const PUPIL = [0x1B, 0x26, 0x18];

function irisFor(debt) {
  if (debt >= 3) return IRIS.angry;
  if (debt >= 1) return IRIS.warm;
  return IRIS.calm;
}

// Цвет в точке (x, y ∈ [-1, 1]) или null, если там прозрачно.
function sample(x, y, iris) {
  const W = 0.94, H = 0.62, T = 0.075;
  if (Math.abs(x) >= W) return null;
  const edge = H * (1 - (x / W) ** 2);          // половина высоты миндалины в этой точке
  const f = Math.abs(y) - edge;
  if (f >= 0) return null;
  if (f > -T) return OUTLINE;                   // обводка по краю века
  const r = Math.hypot(x, y);
  if (Math.hypot(x + 0.1, y + 0.12) < 0.07) return WHITE;   // блик
  if (r < 0.18) return PUPIL;
  if (r < 0.38) return iris;
  if (r < 0.42) return iris.map((c) => Math.round(c * 0.72));   // тёмный ободок радужки
  return WHITE;
}

// RGBA-буфер size×size.
function eyeRGBA(size, iris = IRIS.calm) {
  const N = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const x = ((px + (sx + 0.5) / N) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / N) / size) * 2 - 1;
          const c = sample(x, y, iris);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
        buf[i + 3] = Math.round((a / (N * N)) * 255);
      }
    }
  }
  return buf;
}

// Для nativeImage.createFromBitmap нужен порядок BGRA.
function eyeBGRA(size, iris) {
  const buf = eyeRGBA(size, iris);
  for (let i = 0; i < buf.length; i += 4) {
    const t = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = t;
  }
  return buf;
}

module.exports = { IRIS, irisFor, eyeRGBA, eyeBGRA };
