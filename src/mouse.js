// Слежение за мышью: смотрит ли человек фильм и вернулся ли к работе.
// Клавиатура не учитывается — только движение курсора.

const ACTIVE_WINDOW_MS = 30 * 1000;  // смотрим на последние 30 секунд
const ACTIVE_NEED_SEC = 20;          // из них мышь должна двигаться минимум 20
const MOVE_PX = 2;                   // дрожание меньше этого — не движение

class MouseTracker {
  constructor(now = Date.now()) {
    this.last = null;
    this.lastMoveAt = now;   // только что запущенная программа не считается «на фильме»
    this.moves = [];   // моменты замеров, когда мышь сдвинулась (замер раз в секунду)
  }

  sample(pt, now) {
    if (!this.last) this.lastMoveAt = now;
    else if (Math.abs(pt.x - this.last.x) + Math.abs(pt.y - this.last.y) >= MOVE_PX) {
      this.lastMoveAt = now;
      this.moves.push(now);
    }
    this.last = { x: pt.x, y: pt.y };
    while (this.moves.length && this.moves[0] <= now - ACTIVE_WINDOW_MS) this.moves.shift();
  }

  stillMs(now) { return now - this.lastMoveAt; }

  activeSec(now) { return this.moves.filter((t) => t > now - ACTIVE_WINDOW_MS).length; }
}

// Режим «смотрю фильм»: пока он включён, перерыв и напоминания ждут.
// Включается, когда мышь не двигается stillLimitMs.
// Выключается, только когда мышью реально работают (20 из последних 30 секунд),
// поэтому короткое движение — пауза, громкость — ничего не запускает.
function nextWatching(watching, { stillMs, activeSec }, stillLimitMs) {
  if (!watching) return stillMs >= stillLimitMs;
  return activeSec < ACTIVE_NEED_SEC;
}

module.exports = { MouseTracker, nextWatching, ACTIVE_NEED_SEC };
