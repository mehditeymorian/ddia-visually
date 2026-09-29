/* DDIA Visual Guide — Playground navigation: the lab header, scenario cards, the overview
 * grid and the strip above the model. status() is pure so scripts/labtest.mjs can test it;
 * everything else builds DOM when called, never at load time. See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  const isChallenge = (l, tab) => l.challenges.some((c) => c.id === tab.id);

  /** Where the learner stands on one preset or challenge. prog = store.labs[labId]; old saves lack f and s. */
  function status(l, tab, prog) {
    const p = (prog && prog.p) || {};
    const c = (prog && prog.c) || {};
    const s = (prog && prog.s) || {};
    if (isChallenge(l, tab)) {
      if (c[tab.id]) return { kind: 'passed', label: 'Passed' };
      if (s[tab.id]) return { kind: 'seen', label: 'Solution seen' };
      return { kind: 'open', label: 'Not passed yet' };
    }
    if (!tab.predict) return { kind: 'sandbox', label: 'Sandbox' };
    const r = p[tab.id];
    if (r == null) return { kind: 'new', label: 'Not tried' };
    if (r.a === -1) return { kind: 'ran', label: 'Ran without predicting' };
    return r.ok ? { kind: 'right', label: 'Predicted right' } : { kind: 'missed', label: 'Missed' };
  }

  DDIA.labnav = { status };
})();
