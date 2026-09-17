// Сравнение версий вида 1.2.3 (буква v в начале допускается).
function parseVersion(v) {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// true, если candidate новее current
function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

module.exports = { parseVersion, isNewer };
