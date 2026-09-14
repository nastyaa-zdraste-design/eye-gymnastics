// Звуковая дорожка зарядки: когда какой сигнал играть (секунды от начала).
// Работает и в Node (проверки), и в окне перерыва.
(function (root) {
  // steps: [{ sec }] → [{ t, kind: 'tick' | 'step' | 'done', id }]
  function timeline(steps) {
    const ev = [];
    let start = 0;
    steps.forEach(function (s, i) {
      const end = start + s.sec;
      // 3-2-1 перед концом шага — только внутри шага, не поверх звука его начала
      for (let k = 3; k >= 1; k--) {
        const t = end - k;
        if (t > start) ev.push({ t: t, kind: 'tick', id: 'tick-' + i + '-' + k });
      }
      const last = i === steps.length - 1;
      ev.push({ t: end, kind: last ? 'done' : 'step', id: (last ? 'done' : 'step-') + (last ? '' : i + 1) });
      start = end;
    });
    return ev;
  }

  const api = { timeline: timeline };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EGTimeline = api;
})(this);
