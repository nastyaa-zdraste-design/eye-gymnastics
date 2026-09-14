// «Долг глазам»: чем больше переносов подряд, тем быстрее возвращается
// перерыв и тем настойчивее программа напоминает о себе между перерывами.
// Все числа — здесь, чтобы механику было легко подкрутить.

const LEVELS = [
  // 0 — долга нет
  { snoozeMin: 0,  eyesEverySec: 0,  sleepy: false, ghostsEverySec: 0,  haze: false, holdToSnooze: false },
  // 1 — честный перенос, без эффектов
  { snoozeMin: 20, eyesEverySec: 0,  sleepy: false, ghostsEverySec: 0,  haze: false, holdToSnooze: false },
  // 2 — глаза выглядывают из-за края экрана
  { snoozeMin: 15, eyesEverySec: 120, sleepy: false, ghostsEverySec: 0,  haze: false, holdToSnooze: false },
  // 3 — глаза чаще и сонные
  { snoozeMin: 10, eyesEverySec: 60, sleepy: true,  ghostsEverySec: 0,  haze: false, holdToSnooze: false },
  // 4 — курсор галлюцинирует
  { snoozeMin: 7,  eyesEverySec: 60, sleepy: true,  ghostsEverySec: 45, haze: false, holdToSnooze: false },
  // 5+ — дымка по краям, «Отложить» надо удерживать
  { snoozeMin: 5,  eyesEverySec: 40, sleepy: true,  ghostsEverySec: 30, haze: true,  holdToSnooze: true },
];

const MAX_LEVEL = LEVELS.length - 1;

function levelInfo(debt) {
  const n = Math.max(0, Math.min(MAX_LEVEL, Math.floor(debt || 0)));
  return { level: n, ...LEVELS[n] };
}

// Какой эффект пора показать. last — { eyes, ghosts } время последнего показа (мс).
// Возвращает список эффектов, которым пора появиться.
function dueEffects(debt, nowMs, last, mercy) {
  if (mercy) return [];
  const info = levelInfo(debt);
  const due = [];
  if (info.eyesEverySec && nowMs - (last.eyes || 0) >= info.eyesEverySec * 1000) due.push('eyes');
  if (info.ghostsEverySec && nowMs - (last.ghosts || 0) >= info.ghostsEverySec * 1000) due.push('ghosts');
  return due;
}

module.exports = { LEVELS, MAX_LEVEL, levelInfo, dueEffects };
