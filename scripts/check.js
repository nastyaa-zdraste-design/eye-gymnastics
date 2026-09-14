// Быстрые проверки логики без запуска Electron: npm run check
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseExercises, parseJokes, pickJoke, jokeKey, loadContent } = require('../src/content');
const { levelInfo, dueEffects, MAX_LEVEL } = require('../src/debt');
const { loadState, saveState } = require('../src/state');
const { timeline } = require('../src/timeline');

const root = path.join(__dirname, '..');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok ', name); };

ok('встроенные упражнения: 9 шагов, ровно 5 минут', () => {
  const steps = parseExercises(fs.readFileSync(path.join(root, 'content/exercises.txt'), 'utf8'));
  assert.strictEqual(steps.length, 9);
  assert.strictEqual(steps.reduce((a, s) => a + s.sec, 0), 300);
  assert.deepStrictEqual(steps.map((s) => s.guide), ['', '', 'dark', '', 'focus', 'cross', 'diag', '', '']);
  assert.ok(steps.every((s) => s.text.length > 0));
});

ok('разбор упражнений: комментарии, BOM, CRLF, неизвестная подсказка', () => {
  const s = parseExercises('﻿# x\r\n[А | 10 | wat]\r\nстрока 1\r\n# скрыто\r\nстрока 2\r\n\r\n[Б|5]\r\nб\r\n[В | 0]\r\n');
  assert.deepStrictEqual(s, [
    { name: 'А', sec: 10, guide: '', text: 'строка 1\nстрока 2' },
    { name: 'Б', sec: 5, guide: '', text: 'б' },
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

ok('уровни долга', () => {
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
  assert.strictEqual(loadState(f).settings.intervalMin, 60);
  fs.writeFileSync(f, '{oops');
  assert.strictEqual(loadState(f).debt, 0);
  fs.writeFileSync(f, JSON.stringify({ debt: 3, settings: { mercy: true, intervalMin: 'x' } }));
  const s = loadState(f);
  assert.strictEqual(s.debt, 3);
  assert.strictEqual(s.settings.mercy, true);
  assert.strictEqual(s.settings.intervalMin, 60);
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

console.log(`\nвсе проверки пройдены: ${n}`);
