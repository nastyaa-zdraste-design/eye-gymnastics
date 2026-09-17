// Смешные подписи для экрана после переноса. Группа зависит от числа переносов.
const CAPTIONS = [
  { from: 1, to: 2, list: ['Работа — не волк', 'Опять „ещё одна задача“?'] },
  { from: 3, to: 4, list: ['Дедлайн подождёт, глаза — нет', 'Глаза объявили забастовку'] },
  { from: 5, to: Infinity, list: ['Ты ослепнешь', 'Ещё чуть-чуть — и очки', 'Даже у монитора есть спящий режим'] },
];

function captionGroup(debt) {
  const g = CAPTIONS.find((x) => debt >= x.from && debt <= x.to);
  return g ? g.list : [];
}

// Новая подпись не повторяет прошлую, если в группе есть из чего выбрать.
function pickCaption(debt, last, random = Math.random) {
  const list = captionGroup(debt);
  if (!list.length) return '';
  const pool = list.length > 1 ? list.filter((c) => c !== last) : list;
  return pool[Math.floor(random() * pool.length)];
}

// «Отложено 1 раз», «Отложено 2 раза», «Отложено 5 раз», «Отложено 22 раза»
function snoozedLabel(n) {
  const a = n % 10, b = n % 100;
  const word = a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'раза' : 'раз';
  return `Отложено ${n} ${word}`;
}

module.exports = { CAPTIONS, captionGroup, pickCaption, snoozedLabel };
