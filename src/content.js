// Упражнения и анекдоты: разбор txt-файлов и выбор анекдота без повторов.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GUIDES = new Set(['cross', 'diag', 'focus', 'dark']);

function lines(text) {
  return String(text).replace(/^﻿/, '').split(/\r?\n/);
}

// [Название | секунды]  или  [Название | секунды | подсказка]
function parseExercises(text) {
  const steps = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      cur.text = cur.buf.join('\n').trim();
      delete cur.buf;
      steps.push(cur);
    }
    cur = null;
  };
  for (const raw of lines(text)) {
    if (raw.trimStart().startsWith('#')) continue;
    const m = raw.match(/^\s*\[\s*(.+?)\s*\|\s*(\d+)\s*(?:\|\s*([a-z]+)\s*)?\]\s*$/i);
    if (m) {
      flush();
      const guide = (m[3] || '').toLowerCase();
      cur = { name: m[1], sec: parseInt(m[2], 10), guide: GUIDES.has(guide) ? guide : '', buf: [] };
      continue;
    }
    if (cur) cur.buf.push(raw.trimEnd());
  }
  flush();
  return steps.filter((s) => s.sec > 0);
}

// Анекдоты разделены строкой ---
function parseJokes(text) {
  const out = [];
  let buf = [];
  const flush = () => {
    const j = buf.join('\n').trim();
    if (j) out.push(j);
    buf = [];
  };
  for (const raw of lines(text)) {
    if (raw.trimStart().startsWith('#')) continue;
    if (raw.trim() === '---') { flush(); continue; }
    buf.push(raw.trimEnd());
  }
  flush();
  return out;
}

function jokeKey(joke) {
  return crypto.createHash('sha1').update(joke, 'utf8').digest('hex').slice(0, 10);
}

// Возвращает { joke, used } — used уже с учётом показанного анекдота.
// Когда круг пройден, начинается новый.
function pickJoke(jokes, used, random = Math.random) {
  if (!jokes.length) return { joke: '', used: used || [] };
  let seen = new Set(used || []);
  let free = jokes.filter((j) => !seen.has(jokeKey(j)));
  if (!free.length) { seen = new Set(); free = jokes.slice(); }
  const joke = free[Math.floor(random() * free.length)];
  seen.add(jokeKey(joke));
  return { joke, used: [...seen] };
}

// Свои тексты пользователя (папка данных) важнее встроенных.
function readFirst(files) {
  for (const f of files) {
    try { return fs.readFileSync(f, 'utf8'); } catch (_) { /* следующий */ }
  }
  return '';
}

function loadContent(userDir, bundledDir) {
  const pick = (name) => [path.join(userDir, name), path.join(bundledDir, name)];
  let steps = parseExercises(readFirst(pick('exercises.txt')));
  if (!steps.length) steps = parseExercises(readFirst([path.join(bundledDir, 'exercises.txt')]));
  let jokes = parseJokes(readFirst(pick('jokes.txt')));
  if (!jokes.length) jokes = parseJokes(readFirst([path.join(bundledDir, 'jokes.txt')]));
  return { steps, jokes };
}

module.exports = { parseExercises, parseJokes, jokeKey, pickJoke, loadContent };
