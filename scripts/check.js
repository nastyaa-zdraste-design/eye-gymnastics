// Быстрые проверки логики без запуска Electron: npm run check
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseExercises, parseJokes, pickJoke, jokeKey, loadContent } = require('../src/content');
const { levelInfo, dueEffects, MAX_LEVEL } = require('../src/debt');
const { loadState, saveState } = require('../src/state');
const { timeline } = require('../src/timeline');
const { MouseTracker, nextWatching } = require('../src/mouse');
const { captionGroup, pickCaption, snoozedLabel } = require('../src/captions');

const root = path.join(__dirname, '..');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok ', name); };

ok('встроенные упражнения: 8 шагов, 3:10, движения глазами 40 с', () => {
  const steps = parseExercises(fs.readFileSync(path.join(root, 'content/exercises.txt'), 'utf8'));
  assert.strictEqual(steps.length, 8);
  assert.strictEqual(steps.reduce((a, s) => a + s.sec, 0), 190);
  assert.strictEqual(steps.find((s) => s.name === 'Движения глазами').sec, 40);
  assert.ok(steps.every((s) => s.text.length > 0));
});

ok('разбор упражнений: комментарии, BOM, CRLF, пустые шаги', () => {
  const s = parseExercises('﻿# x\r\n[А | 10]\r\nстрока 1\r\n# скрыто\r\nстрока 2\r\n\r\n[Б|5]\r\nб\r\n[В | 0]\r\n');
  assert.deepStrictEqual(s, [
    { name: 'А', sec: 10, text: 'строка 1\nстрока 2' },
    { name: 'Б', sec: 5, text: 'б' },
  ]);
});

ok('анекдоты: 45 штук', () => {
  const j = parseJokes(fs.readFileSync(path.join(root, 'content/jokes.txt'), 'utf8'));
  assert.strictEqual(j.length, 45);
});

ok('анекдоты не повторяются до конца круга', () => {
  const jokes = ['a', 'b', 'c'];
  let used = [];
  const seen = [];
  for (let i = 0; i < 3; i++) { const r = pickJoke(jokes, used); used = r.used; seen.push(r.joke); }
  assert.deepStrictEqual(seen.slice().sort(), ['a', 'b', 'c']);
  const r = pickJoke(jokes, used);
  assert.deepStrictEqual(r.used, [jokeKey(r.joke)]);
});

ok('свои тексты пользователя важнее встроенных, битый файл — откат', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-'));
  fs.writeFileSync(path.join(dir, 'exercises.txt'), '[Своё | 30]\nтекст');
  fs.writeFileSync(path.join(dir, 'jokes.txt'), '# пусто');
  const c = loadContent(dir, path.join(root, 'content'));
  assert.strictEqual(c.steps.length, 1);
  assert.strictEqual(c.jokes.length, 45);
});

ok('уровни переносов', () => {
  assert.strictEqual(levelInfo(0).snoozeMin, 0);
  assert.strictEqual(levelInfo(1).snoozeMin, 20);
  assert.strictEqual(levelInfo(99).level, MAX_LEVEL);
  assert.ok(levelInfo(99).holdToSnooze);
  assert.deepStrictEqual(dueEffects(1, 1e9, {}, false), []);
  assert.deepStrictEqual(dueEffects(4, 1e9, {}, false), ['eyes', 'ghosts']);
  assert.deepStrictEqual(dueEffects(4, 1e9, {}, true), []);
  assert.deepStrictEqual(dueEffects(2, 100000, { eyes: 0 }, false), []);
});

ok('состояние: пустое, битое, частичное, запись', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-'));
  const f = path.join(dir, 's.json');
  assert.strictEqual(loadState(f).settings.stillMin, 5);
  fs.writeFileSync(f, '{oops');
  assert.strictEqual(loadState(f).debt, 0);
  fs.writeFileSync(f, JSON.stringify({ debt: 3, settings: { mercy: true, intervalMin: 'x', idleResetMin: 9 } }));
  const s = loadState(f);
  assert.strictEqual(s.debt, 3);
  assert.strictEqual(s.settings.mercy, true);
  assert.strictEqual(s.settings.intervalMin, 60);
  assert.strictEqual(s.settings.idleResetMin, undefined);
  s.debt = 4;
  assert.ok(saveState(f, s));
  assert.strictEqual(loadState(f).debt, 4);
});

ok('звуковая дорожка: 3-2-1 перед каждой сменой шага и финалом', () => {
  const ev = timeline([{ sec: 10 }, { sec: 5 }, { sec: 2 }]);
  const at = (k) => ev.filter((e) => e.kind === k).map((e) => e.t);
  // в шаге длиной 2 с тик на 15-й секунде совпал бы со звуком смены — его нет
  assert.deepStrictEqual(at('tick'), [7, 8, 9, 12, 13, 14, 16]);
  assert.deepStrictEqual(at('step'), [10, 15]);
  assert.deepStrictEqual(at('done'), [17]);
});

ok('мышь: сразу после запуска не считается неподвижной', () => {
  const m = new MouseTracker(1000);
  assert.strictEqual(m.stillMs(1500), 500);
  assert.strictEqual(nextWatching(false, { stillMs: m.stillMs(1500), activeSec: 0 }, 5 * 60 * 1000), false);
});

ok('мышь: неподвижность и активность за последние 30 секунд', () => {
  const m = new MouseTracker(0);
  let t = 0;
  m.sample({ x: 0, y: 0 }, t);
  for (let i = 1; i <= 300; i++) m.sample({ x: 1, y: 0 }, (t = i * 1000));   // дрожание в 1 px — не движение
  assert.strictEqual(m.stillMs(t), 300 * 1000);
  assert.strictEqual(m.activeSec(t), 0);
  m.sample({ x: 50, y: 0 }, (t += 1000));   // одно движение, например громкость
  assert.strictEqual(m.stillMs(t), 0);
  assert.strictEqual(m.activeSec(t), 1);
  for (let i = 0; i < 25; i++) m.sample({ x: 100 + i * 10, y: 0 }, (t += 1000));
  assert.strictEqual(m.activeSec(t), 26);
  for (let i = 0; i < 31; i++) m.sample({ x: 350, y: 0 }, (t += 1000));
  assert.strictEqual(m.activeSec(t), 0);
});

ok('режим фильма: включается через 5 мин, короткое движение его не выключает', () => {
  const L = 5 * 60 * 1000;
  assert.strictEqual(nextWatching(false, { stillMs: 60000, activeSec: 0 }, L), false);
  assert.strictEqual(nextWatching(false, { stillMs: L, activeSec: 0 }, L), true);
  assert.strictEqual(nextWatching(true, { stillMs: 0, activeSec: 3 }, L), true);    // громкость
  assert.strictEqual(nextWatching(true, { stillMs: 0, activeSec: 19 }, L), true);
  assert.strictEqual(nextWatching(true, { stillMs: 0, activeSec: 20 }, L), false);  // вернулись к работе
});

ok('подписи после переноса: группы, без повтора, окончания', () => {
  assert.deepStrictEqual(captionGroup(0), []);
  assert.strictEqual(pickCaption(0, ''), '');
  assert.ok(captionGroup(1).includes('Работа — не волк'));
  assert.deepStrictEqual(captionGroup(2), captionGroup(1));
  assert.ok(captionGroup(4).includes('Глаза объявили забастовку'));
  assert.ok(captionGroup(50).includes('Ты ослепнешь'));
  for (let i = 0; i < 20; i++) {
    assert.notStrictEqual(pickCaption(2, 'Работа — не волк'), 'Работа — не волк');
    assert.notStrictEqual(pickCaption(6, 'Ты ослепнешь'), 'Ты ослепнешь');
  }
  assert.strictEqual(snoozedLabel(1), 'Отложено 1 раз');
  assert.strictEqual(snoozedLabel(2), 'Отложено 2 раза');
  assert.strictEqual(snoozedLabel(5), 'Отложено 5 раз');
  assert.strictEqual(snoozedLabel(12), 'Отложено 12 раз');
  assert.strictEqual(snoozedLabel(22), 'Отложено 22 раза');
});

console.log(`\nвсе проверки пройдены: ${n}`);
