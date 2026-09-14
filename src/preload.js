// Мост между окнами и основным процессом: окна получают только эти функции.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('eg', {
  // окно перерыва
  init: () => ipcRenderer.invoke('break:init'),
  sounds: () => ipcRenderer.invoke('sounds:load'),
  finished: () => ipcRenderer.send('break:finished'),
  close: () => ipcRenderer.send('break:close'),
  log: (msg) => ipcRenderer.send('app:log', msg),
  // окно донимания
  onNag: on('nag:play'),
  onCursor: on('nag:cursor'),
  onHaze: on('nag:haze'),
  onReset: on('nag:reset'),
  nagIdle: () => ipcRenderer.send('nag:idle'),
});
