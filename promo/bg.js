// Фон для записи роликов: обычный рабочий экран на весь монитор.
// Запуск: npx electron promo/bg.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setPath('userData', path.join(app.getPath('temp'), 'eye-promo-bg'));

app.whenReady().then(() => {
  const w = new BrowserWindow({
    fullscreen: true, frame: false, backgroundColor: '#E9EBEF', skipTaskbar: true,
    webPreferences: { backgroundThrottling: false },
  });
  // Держим поверх всего, но ниже окон программы: на записи не должно быть
  // ничего лишнего — ни чатов, ни панели задач.
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.loadFile(path.join(__dirname, 'desktop.html'));
  setInterval(() => { if (!w.isDestroyed()) w.moveTop(); }, 1000);
});

app.on('window-all-closed', () => app.quit());
