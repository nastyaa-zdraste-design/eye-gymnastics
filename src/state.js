// Состояние и настройки в одном JSON-файле в папке данных пользователя.
// Запись через временный файл: если программа упадёт посреди записи,
// старый файл останется целым.
const fs = require('fs');

const DEFAULTS = {
  settings: {
    intervalMin: 60,   // как часто перерыв
    sound: true,       // звуки
    volume: 0.8,       // громкость 0..1
    mercy: false,      // щадящий режим: без глаз, курсоров и дымки
    stillMin: 5,       // мышь не двигается столько минут = смотрят фильм;
                       // блокировка или сон компьютера столько минут = отдых
  },
  autostartSet: false, // автозапуск уже включали при первом запуске установленной программы
  debt: 0,             // переносов подряд
  lastAlive: 0,        // когда программа последний раз работала — чтобы засчитать выключение как отдых
  lastCaption: '',     // последняя смешная подпись после переноса — чтобы не повторяться
  jokesUsed: [],
  stats: { done: 0, snoozed: 0 },
};

function merge(def, val) {
  if (Array.isArray(def)) return Array.isArray(val) ? val : def.slice();
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], val && typeof val === 'object' ? val[k] : undefined);
    return out;
  }
  return typeof val === typeof def ? val : def;
}

function loadState(file) {
  try {
    return merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) {
    return merge(DEFAULTS, undefined);
  }
}

function saveState(file, state) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error('state save failed:', e.message);
    return false;
  }
}

module.exports = { DEFAULTS, loadState, saveState, merge };
