// Окно перерыва: отсчёт, звук, подсказки, кнопки.
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const eg = window.eg;

  const D = await eg.init();
  if (!D || !D.steps || !D.steps.length) { eg.close(); return; }

  const S = D.steps;
  const ends = [];
  let acc = 0;
  S.forEach((s) => { acc += s.sec; ends.push(acc); });
  const TOTAL = acc;

  const head = $('head'), title = $('title'), body = $('body'), cue = $('cue'), prog = $('prog'),
    fill = $('fill'), dot = $('dot'), debtEl = $('debt'), hint = $('hint'),
    bSkip = $('bSkip'), bSnooze = $('bSnooze'), bBack = $('bBack');

  const t0 = performance.now();
  let offset = 0, lastIdx = -1, finished = false;

  const elapsed = () => (performance.now() - t0) / 1000 + offset;
  const stepAt = (el) => { let i = 0; while (i < S.length - 1 && el >= ends[i]) i++; return i; };
  const pad = (n) => (n < 10 ? '0' + n : '' + n);

  // ---------------- звук ----------------
  // Сигналы ставятся в очередь аудиочасов заранее (за 0,35 с),
  // поэтому не зависят от того, успел ли отрисоваться кадр.
  const EV = [{ t: 0.4, kind: 'step', id: 'start' }].concat(EGTimeline.timeline(S));
  const LOOKAHEAD = 0.35;
  let ctx = null, gain = null;
  const buffers = {};
  const planned = new Set();
  const pending = new Map();

  async function initSound() {
    if (!D.sound) return;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, D.volume));
      gain.connect(ctx.destination);
      // Будим аудиоустройство тишиной — Bluetooth-наушники иначе съедают первый звук.
      const silence = ctx.createBufferSource();
      silence.buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      silence.connect(gain);
      silence.start();
      if (ctx.state !== 'running') await ctx.resume();
      const raw = await eg.sounds();
      for (const k of ['step', 'tick', 'done']) {
        const u8 = raw && raw[k];
        if (!u8) continue;
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        buffers[k] = await ctx.decodeAudioData(ab);
      }
    } catch (e) {
      eg.log('звук не запустился: ' + e.message);
    }
  }

  function pumpSound(el) {
    if (!ctx) return;
    if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return; }
    for (const e of EV) {
      if (planned.has(e.id)) continue;
      const dt = e.t - el;
      if (dt < -0.25) { planned.add(e.id); continue; }   // уже прошло (например, пропуск шага)
      if (dt > LOOKAHEAD) continue;
      planned.add(e.id);
      const buf = buffers[e.kind];
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      const at = ctx.currentTime + Math.max(0, dt);
      src.start(at);
      if (D.debug) eg.log(`звук ${e.kind} (${e.id}) на ${e.t.toFixed(2)} с, поставлен на ${el.toFixed(2)} с`);
      pending.set(e.id, { src, at });
      src.onended = () => pending.delete(e.id);
    }
  }

  // При пропуске шага отменяем то, что ещё не зазвучало.
  function cancelFuture() {
    if (!ctx) return;
    for (const [id, p] of pending) {
      if (p.at > ctx.currentTime + 0.02) {
        try { p.src.stop(); } catch (_) { /* уже остановлен */ }
        pending.delete(id);
        planned.delete(id);
      }
    }
  }

  // ---------------- кнопки ----------------
  const next = D.next || { snoozeMin: 20, holdToSnooze: false };
  const HOLD_MS = 2000;
  bSkip.textContent = 'Следующее  →';
  bSnooze.querySelector('.lbl').textContent = next.holdToSnooze
    ? `Удерживай, чтобы отложить на ${next.snoozeMin} мин`
    : `Отложить на ${next.snoozeMin} мин`;

  if (D.debt > 0) {
    const w = D.debt % 10 === 1 && D.debt % 100 !== 11 ? 'перенос'
      : [2, 3, 4].includes(D.debt % 10) && ![12, 13, 14].includes(D.debt % 100) ? 'переноса' : 'переносов';
    debtEl.textContent = `Долг глазам: ${D.debt} ${w} подряд. Зарядка до конца его спишет.`;
    debtEl.hidden = false;
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(showHint.t);
    showHint.t = setTimeout(() => hint.classList.remove('show'), 2200);
  }

  function skip() {
    if (finished) return;
    const el = elapsed();
    if (el >= TOTAL) return;
    const i = stepAt(el);
    offset += ends[i] - el;
    cancelFuture();
    logic();
  }

  function snooze() { if (!finished) eg.close(); }

  let holdStart = 0;
  function holdTick() {
    if (!holdStart) return;
    const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    bSnooze.style.setProperty('--p', p.toFixed(3));
    if (p >= 1) { holdStart = 0; snooze(); return; }
    requestAnimationFrame(holdTick);
  }
  function holdCancel() { holdStart = 0; bSnooze.style.setProperty('--p', '0'); }

  bSkip.addEventListener('click', skip);
  bBack.addEventListener('click', () => eg.close());
  if (next.holdToSnooze) {
    bSnooze.addEventListener('pointerdown', () => { holdStart = performance.now(); requestAnimationFrame(holdTick); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) bSnooze.addEventListener(ev, holdCancel);
  } else {
    bSnooze.addEventListener('click', snooze);
  }

  document.addEventListener('keydown', (e) => {
    if (finished) {
      if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); eg.close(); }
      return;
    }
    if (e.key === ' ') { e.preventDefault(); skip(); }
    else if (e.key === 'Escape') {
      if (next.holdToSnooze) showHint('Долг большой — отложить можно только удержанием кнопки');
      else snooze();
    }
  });

  // ---------------- финал ----------------
  function finish() {
    finished = true;
    eg.finished();
    document.body.className = 'finished';
    head.textContent = 'Готово';
    title.textContent = 'Ты — молодец!';
    body.textContent = D.joke || '';
    debtEl.hidden = true;
    cue.textContent = '';
    setArc(1);
    fill.style.width = '100%';
    bSkip.hidden = true;
    bSnooze.hidden = true;
    bBack.hidden = false;
    bBack.focus();
    setTimeout(() => eg.close(), 60 * 1000);
  }

  // ---------------- отсчёт и подсказки ----------------
  const C = 282.74;
  function setArc(p) {
    prog.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, p)))).toFixed(2));
  }

  function logic() {
    const el = elapsed();
    pumpSound(el);
    if (finished) return;
    if (el >= TOTAL) { finish(); return; }
    const i = stepAt(el);
    if (i !== lastIdx) {
      lastIdx = i;
      title.textContent = S[i].name;
      body.textContent = S[i].text;
      document.body.className = S[i].guide ? 'guide-' + S[i].guide : '';
    }
    const rem = Math.max(0, Math.ceil(TOTAL - el));
    head.textContent = `Шаг ${i + 1} из ${S.length}   ·   до конца ${Math.floor(rem / 60)}:${pad(rem % 60)}`;
  }

  // Точка-подсказка: координаты -1..1 от центра экрана.
  function guideTarget(kind, local, sec) {
    const half = sec / 2;
    const wave = (period) => Math.sin(2 * Math.PI * ((local % period) / period));
    if (kind === 'cross') {
      const v = wave(5);
      return local < half ? { x: 0, y: v, s: 1 } : { x: v, y: 0, s: 1 };
    }
    if (kind === 'diag') {
      if (local < half) {
        const v = wave(5);
        return local < half / 2 ? { x: v, y: v, s: 1 } : { x: v, y: -v, s: 1 };
      }
      const dir = local < half * 1.5 ? 1 : -1;
      const a = dir * 2 * Math.PI * (((local - half) % 6) / 6) - Math.PI / 2;
      return { x: Math.cos(a), y: Math.sin(a), s: 1 };
    }
    if (kind === 'focus') {
      const p = (local % 6) / 6;
      return { x: null, y: null, s: 0.4 + 1.4 * (1 - Math.cos(2 * Math.PI * p)) / 2 };
    }
    return null;
  }

  const pos = { x: 0, y: 0, s: 1, init: false };
  function render() {
    const el = elapsed();
    if (!finished && el < TOTAL) {
      const i = stepAt(el);
      const start = i ? ends[i - 1] : 0;
      const local = el - start;
      setArc(local / S[i].sec);
      fill.style.width = ((el / TOTAL) * 100).toFixed(2) + '%';

      const guide = S[i].guide;
      if (!guide || guide === 'dark') {
        const cyc = ((performance.now() - t0) / 1000) % 10;
        const txt = guide === 'dark' ? '' : cyc < 4 ? 'вдох' : 'выдох';
        if (cue.textContent !== txt) cue.textContent = txt;
      }

      const g = guideTarget(guide, local, S[i].sec);
      if (g) {
        const W = innerWidth, H = innerHeight;
        let tx, ty;
        if (g.x === null) { tx = W * 0.735; ty = H * 0.44; }
        else { tx = W / 2 + g.x * W * 0.36; ty = H / 2 + g.y * H * 0.36; }
        if (!pos.init) { pos.x = tx; pos.y = ty; pos.init = true; }
        pos.x += (tx - pos.x) * 0.2;
        pos.y += (ty - pos.y) * 0.2;
        pos.s += (g.s - pos.s) * 0.2;
        dot.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) scale(${pos.s.toFixed(3)})`;
      }
    }
    requestAnimationFrame(render);
  }

  await initSound();
  logic();
  setInterval(logic, 100);   // логика и звук — отдельно от кадров
  requestAnimationFrame(render);
})();
