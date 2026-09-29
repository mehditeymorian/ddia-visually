#!/usr/bin/env node
// Headless self-test. Usage: node scripts/selftest.mjs <chapter-number|labs|all>
// Opens index.html?selftest=N in headless Chrome, which walks every card,
// clicks every control and answers the quiz (`labs` walks every playground lab
// tab instead, and `all` does both), then prints JSON:
// { ok, errors[], warnings[], cards }. Exit code 1 when errors exist.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const which = process.argv[2] || 'all';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'ddia-selftest-'));
const url = pathToFileURL(join(root, 'index.html')).href + `?selftest=${which}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + (which === 'all' ? 1800 : 300) * 1000;

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1200,900', url,
], { stdio: 'ignore' });

function finish(obj, code) {
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1));
  try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } process.exit(code); }, 300);
}

async function main() {
  let port;
  while (!port) {
    if (Date.now() > deadline) return finish({ ok: false, errors: ['chrome did not start'] }, 1);
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0].trim();
    else await sleep(150);
  }
  let wsUrl;
  while (!wsUrl) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) { /* not ready */ }
    if (!wsUrl) await sleep(150);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const early = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') {
      const ex = d.params.exceptionDetails;
      early.push(`${(ex.exception && ex.exception.description) || ex.text} @ ${ex.url || ''}:${ex.lineNumber}`);
    }
  };
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await call('Runtime.enable');
  // reload so script-parse errors are captured too
  await call('Page.enable');
  await call('Page.reload', { ignoreCache: true });
  while (Date.now() < deadline) {
    await sleep(1000);
    const r = await call('Runtime.evaluate', { expression: "(document.getElementById('selftest-result')||{}).textContent||''", returnByValue: true });
    const txt = r.result && r.result.result && r.result.result.value;
    if (txt) {
      const res = JSON.parse(txt);
      if (early.length) { res.errors = early.map((e) => ({ where: 'script', msg: e })).concat(res.errors); res.ok = false; }
      return finish(res, res.ok ? 0 : 1);
    }
  }
  finish({ ok: false, errors: ['timed out waiting for the self-test to finish'].concat(early) }, 1);
}
main().catch((e) => finish({ ok: false, errors: ['runner failed: ' + (e && e.message)] }, 1));
