// Обновления с GitHub Releases.
// Windows: новая версия скачивается сама и ставится при выходе из программы.
// Mac: без подписи Apple автообновление не работает — показываем ссылку на новую версию.
const { app, net } = require('electron');
const { isNewer } = require('./version');
const pkg = require('../package.json');

const HOURS = 60 * 60 * 1000;

function repoFromPackage() {
  const p = pkg.build && pkg.build.publish;
  if (!p || !p.owner || !p.repo || p.owner.startsWith('__')) return null;
  return { owner: p.owner, repo: p.repo };
}

// onChange({ kind: 'ready' | 'available', version, url })
function setupUpdates({ log, onChange }) {
  const repo = repoFromPackage();
  if (!app.isPackaged || !repo) return { install() {} };

  let install = () => {};
  let check;

  if (process.platform === 'win32') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    autoUpdater.on('update-downloaded', (info) => {
      log('обновление скачано: ' + info.version);
      onChange({ kind: 'ready', version: info.version });
    });
    autoUpdater.on('error', (e) => log('обновление не удалось: ' + (e && e.message)));
    check = () => autoUpdater.checkForUpdates().catch((e) => log('проверка обновлений: ' + e.message));
    install = () => autoUpdater.quitAndInstall(true, true);
  } else {
    check = async () => {
      try {
        const res = await net.fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`,
          { headers: { Accept: 'application/vnd.github+json' } });
        if (!res.ok) return;
        const rel = await res.json();
        if (rel && isNewer(rel.tag_name, app.getVersion())) {
          log('вышла новая версия: ' + rel.tag_name);
          onChange({ kind: 'available', version: String(rel.tag_name).replace(/^v/, ''), url: rel.html_url });
        }
      } catch (e) {
        log('проверка обновлений: ' + e.message);
      }
    };
  }

  setTimeout(check, 30 * 1000);   // не мешаем запуску
  setInterval(check, 6 * HOURS);
  return { install };
}

module.exports = { setupUpdates, repoFromPackage };
