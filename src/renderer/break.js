// Окно перерыва: экран после переноса, упражнения, финал.
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const eg = window.eg;

  // Макет рисуется в 1920×1080 и вписывается в любой экран.
  const fit = () => document.documentElement.style.setProperty(
    '--k', Math.min(innerWidth / 1920, innerHeight / 1080).toFixed(4));
  fit();
  addEventListener('resize', fit);

  const D = await eg.init();
  if (!D || !D.steps || !D.steps.length) { eg.close(); return; }

  const S = D.steps;
  const ends = [];
  let acc = 0;
  S.forEach((s) => { acc += s.sec; ends.push(acc); });
  const TOTAL = acc;

  const head = $('head'), title = $('title'), body = $('body'), fill = $('fill'),
    pulseEl = $('pulse'), hint = $('hint'), joke = $('joke'),
    introEl = $('intro'), stepEl = $('step'), finalEl = $('final'),
    bStart = $('bStart'), bSkip = $('bSkip'), bSnooze = $('bSnooze'), bBack = $('bBack');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INTRO_MS = 5000;
  const hasIntro = D.debt > 0 && !!D.caption;

  let mode = hasIntro ? 'intro' : 'step';
  let t0 = 0, offset = 0, lastIdx = -1, finished = false, introTimer = 0;

  const elapsed = () => (t0 ? (performance.now() - t0) / 1000 + offset : 0);
  const stepAt = (el) => { let i = 0; while (i < S.length - 1 && el >= ends[i]) i++; return i; };
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  // Типографика переносов: «на 2 секунды», «и очки», «чуть-чуть» не разрываются,
  // тире не начинает строку.
  const shortWord = /(^|[\s («„])([а-яёА-ЯЁa-zA-Z]{1,2}) /g;
  const nb = (s) => String(s || '')
    .replace(/(\d) /g, '$1 ')
    .replace(shortWord, '$1$2 ')
    .replace(shortWord, '$1$2 ')          // второй проход — для «и в», «а с»
    .replace(/ —/g, ' —')
    .replace(/([а-яёА-ЯЁa-zA-Z])-(?=[а-яёА-ЯЁa-zA-Z])/g, '$1-⁠');

  function setMode(m) {
    mode = m;
    document.body.className = 'mode-' + m;
    introEl.hidden = m !== 'intro';
    stepEl.hidden = m !== 'step';
    finalEl.hidden = m !== 'final';
    bStart.hidden = m !== 'intro';
    bSkip.hidden = m !== 'step';
    bSnooze.hidden = m === 'final';
    bBack.hidden = m !== 'final';
  }

  function pulse() {
    if (reduced) return;
    pulseEl.classList.remove('go');
    void pulseEl.offsetWidth;
    pulseEl.classList.add('go');
  }

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
    if (!ctx || !t0) return;
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
  bSnooze.querySelector('.lbl').textContent = next.holdToSnooze
    ? `Удерживай, чтобы отложить на ${next.snoozeMin} мин`
    : `Отложить на ${next.snoozeMin} мин`;

  if (hasIntro) {
    $('snoozed').textContent = D.snoozedLabel || '';
    $('caption').textContent = '«' + nb(D.caption) + '»';
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(showHint.t);
    showHint.t = setTimeout(() => hint.classList.remove('show'), 2200);
  }

  function startExercises() {
    if (mode !== 'intro') return;
    clearTimeout(introTimer);
    setMode('step');
    t0 = performance.now();
    logic();
  }

  function skip() {
    if (mode === 'intro') { startExercises(); return; }
    if (finished) return;
    const el = elapsed();
    if (el >= TOTAL) return;
    offset += ends[stepAt(el)] - el;
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

  bStart.addEventListener('click', startExercises);
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
    if (e.key === ' ' || (e.key === 'Enter' && mode === 'intro')) { e.preventDefault(); skip(); }
    else if (e.key === 'Escape') {
      if (next.holdToSnooze) showHint('Отложить можно только удержанием кнопки');
      else snooze();
    }
  });

  // ---------------- смена упражнения ----------------
  // Уход — ease-in 200 мс вверх, появление — ease-out 300 мс снизу, по очереди.
  let swapToken = 0;
  function showStep(i, animate) {
    const apply = () => { title.textContent = nb(S[i].name); body.textContent = nb(S[i].text); };
    if (!animate || reduced) { apply(); return; }
    pulse();
    const token = ++swapToken;
    const parts = [head, title, body];
    const outs = parts.map((el) => el.animate(
      [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }],
      { duration: 200, easing: 'cubic-bezier(.32, 0, .67, 0)', fill: 'forwards' }));
    Promise.all(outs.map((a) => a.finished)).then(() => {
      if (token !== swapToken) return;
      apply();
      outs.forEach((a) => a.cancel());
      parts.forEach((el, k) => el.animate(
        [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 300, delay: k * 60, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'backwards' }));
    }).catch(() => apply());
  }

  // ---------------- финал ----------------
  function finish() {
    finished = true;
    eg.finished();
    joke.textContent = nb(D.joke);
    setMode('final');
    fill.style.transform = 'scaleX(1)';
    pulse();
    bBack.focus({ focusVisible: false });
    setTimeout(() => eg.close(), 60 * 1000);
  }

  // ---------------- отсчёт ----------------
  function logic() {
    if (mode === 'intro') return;
    const el = elapsed();
    pumpSound(el);
    if (finished) return;
    if (el >= TOTAL) { finish(); return; }
    const i = stepAt(el);
    if (i !== lastIdx) {
      const first = lastIdx < 0;
      lastIdx = i;
      showStep(i, !first);
    }
    const rem = Math.max(0, Math.ceil(TOTAL - el));
    head.textContent = `Шаг ${i + 1} из ${S.length}   ·   до конца ${Math.floor(rem / 60)}:${pad(rem % 60)}`;
  }

  function render() {
    if (mode === 'step' && !finished) {
      const el = Math.min(elapsed(), TOTAL);
      const i = stepAt(el);
      const start = i ? ends[i - 1] : 0;
      const p = Math.max(0, Math.min(1, (el - start) / S[i].sec));
      fill.style.transform = `scaleX(${p.toFixed(4)})`;
    }
    requestAnimationFrame(render);
  }

  await initSound();
  setMode(mode);
  if (mode === 'step') t0 = performance.now();
  else introTimer = setTimeout(startExercises, INTRO_MS);
  logic();
  setInterval(logic, 100);   // логика и звук — отдельно от кадров
  requestAnimationFrame(render);
})();
