'use strict';
// Гимнастика для глаз — основной процесс: трей, расписание, окна.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadContent, pickJoke } = require('./content');
const { levelInfo, dueEffects } = require('./debt');
const { loadState, saveState } = require('./state');
const { MouseTracker, nextWatching } = require('./mouse');
const { pickCaption, snoozedLabel } = require('./captions');

const ROOT = path.join(__dirname, '..');
const BUNDLED = path.join(ROOT, 'content');
const SOUNDS = path.join(ROOT, 'assets', 'sounds');
const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER = path.join(__dirname, 'renderer');
const MIN = 60 * 1000;

// Флаги для проверки: --now (перерыв сразу), --short (шаги по 6 с),
// --nag=N (сразу долг N), --interval=M (минут между перерывами)
const argv = process.argv.slice(1);
const hasFlag = (name) => argv.some((a) => a === '--' + name || a.startsWith('--' + name + '='));
const flagValue = (name) => {
  const a = argv.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
};

// Звук без клика пользователя и таймеры, которые не засыпают,
// когда окно перекрыто или экран погашен.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let userDir, stateFile, logFile, state;
let tray = null;
let breakWin = null;
let covers = [];
let current = null;          // текущий перерыв: { joke, used, finished, rest, payload }
let nextAt = 0;              // когда следующий перерыв (мс)
const mouse = new MouseTracker();
let watching = false;        // мышь давно не двигалась — смотрят фильм, перерыв и напоминания ждут
let awaySince = 0;           // когда компьютер заблокировали или усыпили
const lastFx = { eyes: 0, ghosts: 0 };
let nagWin = null, nagReady = null, nagBusy = false, hazeOn = false, cursorTimer = null;
let shootNow = null;         // отладка: сделать снимок окон прямо сейчас

// ---------------- журнал и состояние ----------------
function log(msg) {
  const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + '  ' + msg + '\n';
  try { fs.appendFileSync(logFile, line, 'utf8'); } catch (_) { /* журнал не критичен */ }
  if (!app.isPackaged) process.stdout.write(line);
}
const save = () => saveState(stateFile, state);
const intervalMs = () => {
  const m = parseFloat(flagValue('interval'));
  return (m > 0 ? m : state.settings.intervalMin) * MIN;
};

function schedule(ms, why) {
  nextAt = Date.now() + ms;
  log(`следующий перерыв через ${Math.round(ms / 1000)} с — ${why}`);
  refreshTray();
}

function rested(why) {
  if (state.debt) { state.debt = 0; save(); }
  hideNag();
  log('отдых засчитан: ' + why);
  refreshTray();
}

function snooze(why) {
  state.debt = Math.min(state.debt + 1, 99);
  state.stats.snoozed++;
  save();
  const info = levelInfo(state.debt);
  const now = Date.now();
  // первое напоминание — через полминуты после переноса, дальше по расписанию уровня
  lastFx.eyes = info.eyesEverySec ? now - info.eyesEverySec * 1000 + 30 * 1000 : now;
  lastFx.ghosts = info.ghostsEverySec ? now - info.ghostsEverySec * 1000 + 60 * 1000 : now;
  schedule(info.snoozeMin * MIN, `перенос (${why}), долг ${state.debt}`);
}

// ---------------- главный цикл: раз в 5 секунд ----------------
// Отсчёт часа идёт всегда. Пока смотрят фильм, перерыв не показывается,
// а если время пришло — покажется, когда мышью снова начнут работать.
function check() {
  if (breakWin) return;
  const now = Date.now();
  const was = watching;
  watching = nextWatching(watching, { stillMs: mouse.stillMs(now), activeSec: mouse.activeSec(now) },
    state.settings.stillMin * MIN);
  if (watching !== was) {
    log(watching ? 'мышь не двигается — похоже на фильм, перерыв и напоминания ждут' : 'мышью снова работают');
    if (watching) hideNag();
    refreshTray();
  }
  if (watching) return;
  if (now >= nextAt) { startBreak(was ? 'вернулись к работе после просмотра' : 'по расписанию'); return; }
  updateNag(now);
}

function onAwayStart() { if (!awaySince) awaySince = Date.now(); }
function onAwayEnd() {
  const gone = awaySince ? Date.now() - awaySince : 0;
  awaySince = 0;
  if (gone < state.settings.stillMin * MIN) return;
  if (current) { current.rest = true; if (breakWin) breakWin.close(); }
  else { rested(`компьютер был заблокирован ${Math.round(gone / MIN)} мин`); schedule(intervalMs(), 'после отдыха'); }
}

// ---------------- окно перерыва ----------------
function startBreak(reason) {
  if (breakWin) { breakWin.moveTop(); breakWin.focus(); return; }
  hideNag();
  const content = loadContent(userDir, BUNDLED);
  let steps = content.steps;
  if (hasFlag('short')) steps = steps.map((s) => ({ ...s, sec: Math.min(s.sec, 6) }));
  const pick = pickJoke(content.jokes, state.jokesUsed);
  // После переноса перерыв начинается с экрана со смешной подписью.
  // --caption="…" — только для проверки конкретной подписи
  const forced = app.isPackaged ? null : flagValue('caption');
  const caption = state.debt > 0 ? (forced || pickCaption(state.debt, state.lastCaption)) : '';
  if (caption) { state.lastCaption = caption; save(); }
  current = {
    joke: pick.joke, used: pick.used, finished: false, rest: false,
    payload: {
      steps, joke: pick.joke,
      debt: state.debt,
      caption,
      snoozedLabel: state.debt > 0 ? snoozedLabel(state.debt) : '',
      next: levelInfo(state.debt + 1),
      sound: state.settings.sound,
      volume: state.settings.volume,
      debug: !app.isPackaged && (hasFlag('short') || hasFlag('shots')),
    },
  };

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  breakWin = new BrowserWindow({
    ...display.bounds,
    frame: false, show: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#667A61', title: 'Гимнастика для глаз',
    webPreferences: { preload: PRELOAD, backgroundThrottling: false },
  });
  breakWin.setAlwaysOnTop(true, 'screen-saver');
  breakWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  breakWin.removeMenu();
  breakWin.loadFile(path.join(RENDERER, 'break.html'));
  breakWin.once('ready-to-show', () => {
    if (!breakWin) return;
    breakWin.show();
    breakWin.focus();
    if (shootNow) setTimeout(shootNow, 1500);   // только в режиме снимков
  });
  breakWin.on('blur', () => { if (breakWin) breakWin.moveTop(); });
  breakWin.on('closed', onBreakClosed);
  coverOtherDisplays(display);
  log(`перерыв: ${reason}, долг ${state.debt}`);
  refreshTray();
}

// Остальные мониторы на время перерыва затемняются.
function coverOtherDisplays(main) {
  for (const d of screen.getAllDisplays()) {
    if (d.id === main.id) continue;
    const w = new BrowserWindow({
      ...d.bounds, frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false, hasShadow: false, backgroundColor: '#4C5E48', show: true,
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    covers.push(w);
  }
}

function onBreakClosed() {
  breakWin = null;
  for (const w of covers) if (!w.isDestroyed()) w.close();
  covers = [];
  const c = current;
  current = null;
  if (!c) return;
  if (c.finished) schedule(intervalMs(), 'зарядка выполнена');
  else if (c.rest) { rested('перерыв прерван долгим отсутствием'); schedule(intervalMs(), 'после отдыха'); }
  else snooze('окно закрыто до конца зарядки');
}

// ---------------- донимание между перерывами ----------------
function ensureNag() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!nagWin || nagWin.isDestroyed()) {
    nagWin = new BrowserWindow({
      ...d.bounds,
      transparent: true, backgroundColor: '#00000000', frame: false, focusable: false,
      alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, hasShadow: false, show: false,
      webPreferences: { preload: PRELOAD, backgroundThrottling: false },
    });
    // Прозрачно для мыши: эффекты никогда не мешают кликать и печатать.
    nagWin.setIgnoreMouseEvents(true);
    nagWin.setAlwaysOnTop(true, 'screen-saver');
    nagWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    nagReady = new Promise((resolve) => nagWin.webContents.once('did-finish-load', resolve));
    nagWin.loadFile(path.join(RENDERER, 'nag.html'));
    nagWin.on('closed', () => { nagWin = null; nagBusy = false; hazeOn = false; stopCursor(); });
  } else if (!nagBusy && !hazeOn) {
    nagWin.setBounds(d.bounds);
  }
  return nagWin;
}

function startCursor() {
  if (cursorTimer) return;
  cursorTimer = setInterval(() => {
    if (!nagWin || nagWin.isDestroyed()) return stopCursor();
    const p = screen.getCursorScreenPoint();
    const b = nagWin.getBounds();
    nagWin.webContents.send('nag:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);
}
function stopCursor() { if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; } }

async function playNag(kind, info) {
  const w = ensureNag();
  await nagReady;
  if (w.isDestroyed() || breakWin) return;
  nagBusy = true;
  w.showInactive();
  w.moveTop();
  startCursor();
  // --edge=left|right|top|bottom — только для проверки: с какого края выглянут глаза
  w.webContents.send('nag:play', { kind, level: info.level, sleepy: info.sleepy, edge: flagValue('edge') });
  log(`донимание: ${kind}, уровень ${info.level}`);
}

async function setHaze(on) {
  if (on === hazeOn) return;
  hazeOn = on;
  if (on) {
    const w = ensureNag();
    await nagReady;
    if (w.isDestroyed() || !hazeOn) return;
    w.showInactive();
    w.webContents.send('nag:haze', true);
  } else if (nagWin && !nagWin.isDestroyed()) {
    nagWin.webContents.send('nag:haze', false);
    if (!nagBusy) nagWin.hide();
  }
}

function hideNag() {
  hazeOn = false;
  nagBusy = false;
  stopCursor();
  if (nagWin && !nagWin.isDestroyed()) {
    nagWin.setIgnoreMouseEvents(true);
    nagWin.webContents.send('nag:reset');
    nagWin.hide();
  }
}

function updateNag(now) {
  const info = levelInfo(state.debt);
  setHaze(!state.settings.mercy && info.haze);
  for (const kind of dueEffects(state.debt, now, lastFx, state.settings.mercy)) {
    lastFx[kind] = now;
    playNag(kind, info);
  }
}

// ---------------- связь с окнами ----------------
function setupIpc() {
  ipcMain.handle('break:init', () => (current ? current.payload : null));
  ipcMain.handle('sounds:load', () => {
    const read = (f) => { try { return fs.readFileSync(path.join(SOUNDS, f)); } catch (_) { return null; } };
    return { step: read('bowl-step.wav'), tick: read('bowl-tick.wav'), done: read('bowl-done.wav') };
  });
  ipcMain.on('break:finished', () => {
    if (!current || current.finished) return;
    current.finished = true;
    state.debt = 0;
    state.jokesUsed = current.used;
    state.stats.done++;
    save();
    log('зарядка выполнена');
    refreshTray();
  });
  ipcMain.on('break:close', () => { if (breakWin) breakWin.close(); });
  ipcMain.on('nag:idle', () => {
    nagBusy = false;
    stopCursor();
    if (nagWin && !nagWin.isDestroyed()) {
      nagWin.setIgnoreMouseEvents(true);
      if (!hazeOn) nagWin.hide();
    }
  });
  // Курсор над глазами: окно ловит клик. Ушёл — снова прозрачно для мыши.
  ipcMain.on('nag:hover', (_e, over) => {
    if (nagWin && !nagWin.isDestroyed()) nagWin.setIgnoreMouseEvents(!over);
  });
  ipcMain.on('nag:click', () => startBreak('клик по глазам'));
  ipcMain.on('app:log', (_e, msg) => log('окно: ' + String(msg).slice(0, 300)));
}

// ---------------- автозапуск ----------------
function loginOpts() {
  return app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(ROOT)] };
}
const isAutostart = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...loginOpts() });
  log('автозапуск: ' + (on ? 'включён' : 'выключен'));
}

// ---------------- трей ----------------
// Значок рисуется кодом: глаз, радужка краснеет с ростом долга.
function trayIcon(debt) {
  const S = 32;
  const buf = Buffer.alloc(S * S * 4);
  const iris = debt >= 3 ? [0x4a, 0x55, 0xd9] : debt >= 1 ? [0x3a, 0x7d, 0xe8] : [0x6b, 0xa9, 0xe8]; // BGR
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - 15.5, dy = y - 15.5, i = (y * S + x) * 4;
      const r = Math.hypot(dx, dy);
      const inEye = Math.abs(dx) <= 15 && Math.abs(dy) <= 10 * (1 - (dx / 15.5) ** 2);
      let c = null;
      if (inEye) c = [0xe8, 0xf2, 0xfa];
      if (inEye && r <= 7) c = iris;
      if (r <= 3) c = [0x16, 0x10, 0x1c];
      if (c) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
}

function openTextsFolder() {
  for (const f of ['exercises.txt', 'jokes.txt']) {
    const dst = path.join(userDir, f);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(BUNDLED, f), dst);
  }
  shell.openPath(userDir);
}

function refreshTray() {
  if (!tray) return;
  const mins = Math.max(0, Math.ceil((nextAt - Date.now()) / MIN));
  const status = breakWin ? 'Идёт перерыв'
    : watching && mins === 0 ? 'Перерыв начнётся, когда продолжишь работать'
    : watching ? 'Мышь не двигается — перерыв подождёт'
    : `Перерыв через ${mins} мин`;
  const debtLine = state.debt ? `Отложено ${state.debt} ${plural(state.debt, 'раз', 'раза', 'раз')} подряд` : 'Без переносов';
  tray.setImage(trayIcon(state.debt));
  tray.setToolTip(`Гимнастика для глаз\n${status}\n${debtLine}`);
  const s = state.settings;
  const setInterval_ = (m) => () => { s.intervalMin = m; save(); if (!breakWin) schedule(intervalMs(), 'новый интервал'); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { label: debtLine, enabled: false },
    { type: 'separator' },
    { label: 'Сделать перерыв сейчас', click: () => startBreak('из трея') },
    { label: `Отложить на ${levelInfo(state.debt + 1).snoozeMin} мин`, enabled: !breakWin, click: () => snooze('из трея') },
    { type: 'separator' },
    { label: 'Интервал', submenu: [30, 45, 60, 90].map((m) => ({
      label: `${m} минут`, type: 'radio', checked: s.intervalMin === m, click: setInterval_(m) })) },
    { label: 'Звуки', type: 'checkbox', checked: s.sound, click: (it) => { s.sound = it.checked; save(); } },
    { label: 'Щадящий режим (без глаз и призраков)', type: 'checkbox', checked: s.mercy,
      click: (it) => { s.mercy = it.checked; save(); if (s.mercy) hideNag(); } },
    { label: 'Запускать вместе с системой', type: 'checkbox', checked: isAutostart(),
      click: (it) => setAutostart(it.checked) },
    { label: 'Открыть папку с текстами', click: openTextsFolder },
    { type: 'separator' },
    { label: 'Проверка', submenu: [
      { label: 'Глаза выглядывают', click: () => playNag('eyes', levelInfo(2)) },
      { label: 'Сонные глаза', click: () => playNag('eyes', levelInfo(3)) },
      { label: 'Призрачные курсоры', click: () => playNag('ghosts', levelInfo(4)) },
      { label: 'Дымка вкл/выкл', click: () => setHaze(!hazeOn) },
      { label: 'Сбросить счётчик переносов', click: () => { rested('сброс вручную'); } },
    ] },
    { label: 'Выход', click: () => { log('выход'); app.exit(0); } },
  ]));
}

// Отладка: снимки окон в папку данных/shots, чтобы проверить вид без человека у экрана.
function startShots() {
  const dir = path.join(userDir, 'shots');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const shoot = async () => {
    for (const [name, w] of [['break', breakWin], ['nag', nagWin]]) {
      if (!w || w.isDestroyed() || !w.isVisible()) continue;
      try {
        const img = await w.webContents.capturePage();
        const f = path.join(dir, `${String(++n).padStart(3, '0')}-${name}.png`);
        fs.writeFileSync(f, img.resize({ width: 960 }).toPNG());
        log('снимок: ' + f);
      } catch (e) { log('снимок не удался: ' + e.message); }
    }
  };
  shootNow = shoot;
  setInterval(shoot, 7000);
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

// ---------------- запуск ----------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, args) => {
    if (args.includes('--now')) startBreak('повторный запуск с --now');
    else if (tray && process.platform === 'win32') {
      tray.displayBalloon({ title: 'Гимнастика для глаз', content: 'Уже работает — значок в трее.' });
    }
  });

  app.on('window-all-closed', () => { /* живём в трее */ });

  app.whenReady().then(() => {
    userDir = app.getPath('userData');
    fs.mkdirSync(userDir, { recursive: true });
    stateFile = path.join(userDir, 'state.json');
    logFile = path.join(userDir, 'log.txt');
    try { if (fs.statSync(logFile).size > 300 * 1024) fs.renameSync(logFile, logFile + '.old'); } catch (_) { /* нет журнала */ }
    state = loadState(stateFile);
    log(`запуск ${app.getVersion()}, ${process.platform}, данные: ${userDir}`);

    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    setupIpc();

    tray = new Tray(trayIcon(state.debt));
    tray.on('click', () => tray.popUpContextMenu());

    for (const ev of ['lock-screen', 'suspend']) powerMonitor.on(ev, onAwayStart);
    for (const ev of ['unlock-screen', 'resume']) powerMonitor.on(ev, onAwayEnd);

    // Установленная программа при первом запуске сама включает автозапуск.
    // Дальше галочка в трее — на усмотрение человека.
    if (app.isPackaged && !state.autostartSet) {
      setAutostart(true);
      state.autostartSet = true;
      save();
    }

    const nag = parseInt(flagValue('nag'), 10);
    if (nag >= 0) { state.debt = nag; save(); lastFx.eyes = 0; lastFx.ghosts = 0; }

    if (hasFlag('shots') && !app.isPackaged) startShots();

    schedule(hasFlag('now') ? 1500 : intervalMs(), 'старт');
    setInterval(() => mouse.sample(screen.getCursorScreenPoint(), Date.now()), 1000);
    setInterval(check, hasFlag('now') ? 500 : 5000);
    setInterval(refreshTray, 20 * 1000);
  });
}
