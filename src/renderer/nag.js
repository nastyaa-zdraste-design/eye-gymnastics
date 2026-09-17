// Донимание между перерывами. Окно прозрачно для мыши и никогда не берёт фокус.
// Исключение — глаза и облачко: когда курсор над ними, окно принимает клик,
// и клик запускает зарядку.
(function () {
  'use strict';
  const eg = window.eg;
  const cursor = { x: -1, y: -1 };
  let active = 0;
  const live = new Set();       // всё, что сейчас на экране, для сброса
  const clickable = new Set();  // глаза и облачка
  let hovering = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function begin() { active++; }
  function end() {
    active = Math.max(0, active - 1);
    if (active === 0) eg.nagIdle();
  }

  // Курсор над глазами или облачком — окно начинает принимать клики.
  function updateHover() {
    let over = false;
    for (const el of clickable) {
      const r = el.getBoundingClientRect();
      if (cursor.x >= r.left - 4 && cursor.x <= r.right + 4 && cursor.y >= r.top - 4 && cursor.y <= r.bottom + 4) {
        over = true;
        break;
      }
    }
    if (over !== hovering) { hovering = over; eg.nagHover(over); }
  }

  eg.onCursor((p) => { cursor.x = p.x; cursor.y = p.y; updateHover(); });

  function makeClickable(el) {
    clickable.add(el);
    el.addEventListener('click', () => eg.nagClick());
  }
  function forget(el) {
    clickable.delete(el);
    el.remove();
    updateHover();
  }

  // ---------------- глаза ----------------
  const PHRASES = ['Ты там живой?', 'Моргни, если слышишь', 'Мы тут пересохли', 'Посмотри в окно. Ну пожалуйста',
    'Ку-ку. Это твои глаза', 'Мы всё видим. Пока ещё'];
  const SLEEPY = ['Мы устали…', 'Ещё пять минут, да?', 'Слёзная плёнка всё', 'Зеваем…', 'Спать хотим, а не в эксель'];

  function makeEyes(sleepy) {
    const box = document.createElement('div');
    box.className = 'eyes' + (sleepy ? ' sleepy' : '');
    box.style.setProperty('--size', sleepy ? '13vmin' : '11vmin');
    const eyes = [];
    for (let k = 0; k < 2; k++) {
      const eye = document.createElement('div');
      eye.className = 'eye';
      eye.innerHTML = '<div class="iris"><div class="pupil"></div></div><div class="lid"></div>';
      box.appendChild(eye);
      eyes.push({ el: eye, iris: eye.querySelector('.iris'), lid: eye.querySelector('.lid') });
    }
    const say = document.createElement('div');
    say.className = 'say';
    say.textContent = pick(sleepy ? SLEEPY : PHRASES);
    return { box, eyes, say };
  }

  // Облачко — со стороны центра экрана и всегда целиком на экране.
  function placeSay(say, box, edge) {
    const r = box.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const vmin = Math.min(W, H) / 100;
    const gap = 1.6 * vmin, m = 16;
    const bw = say.offsetWidth, bh = say.offsetHeight;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x, y, tail;
    if (edge === 'bottom') { x = cx - bw / 2; y = r.top - gap - bh; tail = 'down'; }
    else if (edge === 'top') { x = cx - bw / 2; y = r.bottom + gap; tail = 'up'; }
    else if (edge === 'left') { x = r.right + gap; y = cy - bh / 2; tail = 'left'; }
    else { x = r.left - gap - bw; y = cy - bh / 2; tail = 'right'; }
    x = clamp(x, m, W - bw - m);
    y = clamp(y, m, H - bh - m);
    say.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    say.className = say.className.replace(/\btail-\w+/g, '').trim() + ' tail-' + tail;
    // хвостик смотрит на глаза, даже если облачко пришлось сдвинуть
    const t = tail === 'down' || tail === 'up' ? clamp(cx - x, 14, bw - 14) : clamp(cy - y, 12, bh - 12);
    say.style.setProperty('--tail', t.toFixed(1) + 'px');
  }

  const EDGES = ['bottom', 'bottom', 'left', 'right', 'top'];

  async function playEyes(sleepy, forcedEdge) {
    begin();
    const e = makeEyes(sleepy);
    const edge = EDGES.includes(forcedEdge) ? forcedEdge : pick(EDGES);
    const b = e.box;
    let hidden, shown;
    if (edge === 'bottom' || edge === 'top') {
      b.style.left = rand(15, 75) + 'vw';
      b.style[edge] = '-1vmin';
      hidden = `translateY(${edge === 'bottom' ? 130 : -130}%)`;
      shown = `translateY(${edge === 'bottom' ? 8 : -8}%)`;
    } else {
      b.style.top = rand(20, 70) + 'vh';
      b.style[edge] = '-1vmin';
      hidden = `translateX(${edge === 'right' ? 130 : -130}%)`;
      shown = `translateX(${edge === 'right' ? 18 : -18}%)`;
    }
    b.style.transform = hidden;
    document.body.appendChild(b);
    document.body.appendChild(e.say);
    makeClickable(b);
    makeClickable(e.say);
    live.add(b);
    live.add(e.say);

    const baseLid = sleepy ? 0.42 : 0;
    let lid = baseLid, lidTarget = baseLid, running = true;

    const loop = () => {
      if (!running) return;
      for (const eye of e.eyes) {
        const r = eye.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = cursor.x - cx, dy = cursor.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const mv = Math.min(r.width * 0.2, d / 12);
        eye.iris.style.transform = `translate(${(dx / d) * mv}px, ${(dy / d) * mv}px)`;
        lid += (lidTarget - lid) * 0.35;
        eye.lid.style.transform = `scaleY(${lid.toFixed(3)})`;
      }
      placeSay(e.say, b, edge);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const blink = async (slow) => {
      lidTarget = 1;
      await sleep(slow ? 700 : 120);
      lidTarget = baseLid;
      await sleep(slow ? 500 : 150);
    };

    await sleep(30);
    b.style.transform = shown;
    await sleep(900);
    e.say.classList.add('show');
    const lookMs = sleepy ? 6500 : 5000;
    const t0 = Date.now();
    while (Date.now() - t0 < lookMs && live.has(b)) {
      await sleep(rand(900, 1800));
      if (sleepy && Math.random() < 0.5) {
        // клюёт носом: веки медленно падают и с трудом открываются
        lidTarget = 0.9; await sleep(1400); lidTarget = baseLid; await sleep(600);
      } else {
        await blink(sleepy);
      }
    }
    e.say.classList.remove('show');
    b.style.transform = hidden;
    await sleep(900);
    running = false;
    forget(b);
    forget(e.say);
    live.delete(e.say);
    if (live.delete(b)) end();
  }

  // ---------------- призрачные курсоры ----------------
  const ARROW = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 24"><path d="M1 1 L1 19 L5.5 14.8 L8.6 22 L11.4 20.8 L8.4 13.8 L14.5 13.8 Z" fill="rgba(246,249,242,0.92)" stroke="#3E5143" stroke-width="1.2" stroke-linejoin="round"/></svg>');

  async function playGhosts(level) {
    begin();
    const count = level >= 5 ? 6 : 3;
    const ghosts = [];
    const token = {};
    live.add(token);
    const t0 = performance.now();
    let running = true;

    const add = (k) => {
      const img = document.createElement('img');
      img.src = ARROW;
      img.className = 'ghost';
      img.style.setProperty('--o', (0.62 - k * 0.07).toFixed(2));
      document.body.appendChild(img);
      const g = { el: img, x: cursor.x, y: cursor.y, k, phase: rand(0, Math.PI * 2) };
      ghosts.push(g);
      requestAnimationFrame(() => img.classList.add('show'));
    };

    const loop = () => {
      if (!running) return;
      const t = (performance.now() - t0) / 1000;
      for (const g of ghosts) {
        // каждый призрак отстаёт сильнее предыдущего и кружит вокруг курсора
        const radius = 18 + g.k * 14 + Math.sin(t * 1.3 + g.phase) * 8;
        const tx = cursor.x + Math.cos(t * (0.9 + g.k * 0.15) + g.phase) * radius;
        const ty = cursor.y + Math.sin(t * (1.1 + g.k * 0.12) + g.phase) * radius;
        const f = 0.12 / (1 + g.k * 0.45);
        g.x += (tx - g.x) * f;
        g.y += (ty - g.y) * f;
        g.el.style.transform = `translate(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px) rotate(${Math.sin(t * 2 + g.k) * 8}deg)`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // множатся по одному
    for (let k = 0; k < count && live.has(token); k++) { add(k); await sleep(900); }
    await sleep(level >= 5 ? 6000 : 4500);
    for (const g of ghosts) g.el.classList.remove('show');
    await sleep(700);
    running = false;
    for (const g of ghosts) g.el.remove();
    if (live.delete(token)) end();
  }

  // ---------------- связь ----------------
  eg.onNag((d) => {
    if (d.kind === 'eyes') playEyes(!!d.sleepy, d.edge);
    else if (d.kind === 'ghosts') playGhosts(d.level || 4);
  });
  eg.onHaze((on) => document.getElementById('haze').classList.toggle('on', !!on));
  eg.onReset(() => {
    document.getElementById('haze').classList.remove('on');
    for (const item of live) if (item instanceof HTMLElement) item.remove();
    document.querySelectorAll('.ghost').forEach((g) => g.remove());
    live.clear();
    clickable.clear();
    hovering = false;
    active = 0;
  });
})();
