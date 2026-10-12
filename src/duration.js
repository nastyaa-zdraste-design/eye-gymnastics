// Длительность по-человечески: «45 мин», «1 ч», «3 ч 20 мин».
function humanDur(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${total} мин`;
}

module.exports = { humanDur };
