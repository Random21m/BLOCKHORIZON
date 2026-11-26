// The phone notifications server (packaging/push.js) inside a real nginx with njs, against a fake mempool and a fake
// ntfy server: node tests/push.mjs. Needs nginx and its njs module (Debian/Ubuntu: nginx libnginx-mod-http-js); skipped
// without them.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const mod = ['/usr/lib/nginx/modules/ngx_http_js_module.so', '/etc/nginx/modules/ngx_http_js_module.so'].find((f) =>
  fs.existsSync(f)
);
let nginxBin = '';
try {
  nginxBin = execFileSync('sh', ['-c', 'command -v nginx || ls /usr/sbin/nginx'], { encoding: 'utf8' }).trim();
} catch {
  /* none */
}
if (!mod || !nginxBin) {
  console.log('skipped: nginx with the njs module is not installed');
  process.exit(0);
}

const listen = (h) =>
  new Promise((ok) => {
    const s = http.createServer(h);
    s.listen(0, '127.0.0.1', () => ok(s));
  });
// the node's mempool: values the test changes
const chain = {
  tip: 900000,
  fees: { fastestFee: 12, halfHourFee: 8, hourFee: 5, economyFee: 2, minimumFee: 1 },
  prices: { time: 1, USD: 60000, EUR: 55000 },
  txs: {}, // txid -> block height (0 while waiting)
};
const mempool = await listen((q, r) => {
  const u = q.url.replace(/^\/api/, '');
  if (u === '/blocks/tip/height') return r.end(String(chain.tip));
  if (u === '/v1/fees/recommended') {
    r.setHeader('content-type', 'application/json');
    return r.end(JSON.stringify(chain.fees));
  }
  if (/^\/tx\/[0-9a-f]{64}\/status$/.test(u)) {
    const h = chain.txs[u.split('/')[2]];
    if (h === undefined) {
      r.statusCode = 404;
      return r.end();
    }
    r.setHeader('content-type', 'application/json');
    return r.end(JSON.stringify(h ? { confirmed: true, block_height: h } : { confirmed: false }));
  }
  if (u === '/v1/prices') {
    r.setHeader('content-type', 'application/json');
    return r.end(JSON.stringify(chain.prices));
  }
  r.statusCode = 404;
  r.end();
});
// ntfy: records what it is sent
const got = [];
const ntfy = await listen((q, r) => {
  let b = '';
  q.on('data', (c) => {
    b += c;
  });
  q.on('end', () => {
    got.push({ path: q.url, body: b, title: q.headers.title, click: q.headers.click });
    r.end('{}');
  });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-push-')),
  data = path.join(dir, 'data');
fs.mkdirSync(data);
const port = 20000 + Math.floor(Math.random() * 20000),
  base = `http://127.0.0.1:${port}`;
const root = path.resolve(new URL('..', import.meta.url).pathname);
// the same locations 40-blockhorizon.sh writes, with a 1 second check instead of a minute
fs.writeFileSync(
  path.join(dir, 'nginx.conf'),
  `load_module ${mod};
env BH_DATA; env BH_API; user root; worker_processes 2; daemon off; pid ${dir}/nginx.pid; error_log ${dir}/error.log info;
events {}
http {
  access_log off; client_body_temp_path ${dir}; proxy_temp_path ${dir}; fastcgi_temp_path ${dir}; uwsgi_temp_path ${dir}; scgi_temp_path ${dir};
  js_import bh from ${root}/packaging/push.js; js_fetch_timeout 5s;
  server {
    listen 127.0.0.1:${port};
    location /api/ { proxy_pass http://127.0.0.1:${mempool.address().port}/api/; }
    location = /push/sync { client_max_body_size 64k; client_body_buffer_size 64k; js_content bh.sync; }
    location = /push/test { client_max_body_size 4k; client_body_buffer_size 4k; js_content bh.test; }
    location @bh_check { js_periodic bh.check interval=1s; }
  }
}`
);
const ng = spawn(nginxBin, ['-p', dir, '-c', path.join(dir, 'nginx.conf')], {
  env: Object.assign({}, process.env, { BH_DATA: data, BH_API: base + '/api' }),
  stdio: 'inherit',
});
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const until = async (f, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await wait(100);
  }
  throw new Error('timed out');
};
await until(async () => {
  try {
    await fetch(base + '/api/blocks/tip/height');
    return true;
  } catch {
    return false;
  }
});

const topic = `http://127.0.0.1:${ntfy.address().port}/bh-test`;
const sync = (b) =>
  fetch(base + '/push/sync', { method: 'PUT', body: JSON.stringify(b) }).then(async (r) => ({
    status: r.status,
    json: await r.json(),
  }));
let failed = 0;
const ok = async (name, f) => {
  try {
    await f();
    console.log('ok   ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, e.message);
  }
};

try {
  await ok('a test message reaches the topic', async () => {
    const r = await fetch(base + '/push/test', {
      method: 'POST',
      body: JSON.stringify({ url: topic, msg: 'Test message', click: 'http://umbrel.local:3027/' }),
    });
    assert.equal(r.status, 200);
    await until(() => got.length === 1);
    assert.deepEqual(
      [got[0].path, got[0].body, got[0].title, got[0].click],
      ['/bh-test', 'Test message', 'BLOCKHORIZON', 'http://umbrel.local:3027/']
    );
    got.length = 0;
  });
  await ok('bad input is refused', async () => {
    assert.equal((await sync({ id: 'x', url: topic })).status, 400);
    assert.equal((await sync({ id: 'abcdefgh12', url: 'file:///etc/passwd' })).status, 400);
    assert.equal((await fetch(base + '/push/sync')).status, 405);
  });
  await ok('alarms already reached when sent are left to the open browser; the rest are watched', async () => {
    const r = await sync({
      id: 'browser0001',
      url: topic,
      click: 'http://node.local/',
      grp: '.',
      dec: ',',
      alerts: [
        { kind: 'height', height: 899999, msg: 'old' },
        { kind: 'height', height: 900002, msg: 'Block 900,002 reached' },
        { kind: 'fee', level: 'next', max: 3, msg: 'Fees: next block {now} sat/vB (limit 3)' },
        { kind: 'fee', level: 'h1', max: 9, msg: 'already low' },
        { kind: 'price', cur: 'EUR', price: 50000, dir: 'down', msg: 'Price down to 50,000 EUR: now {now} EUR' },
        { kind: 'nonsense', msg: 'x' },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.watching, 3);
    await wait(2500);
    assert.equal(got.length, 0, 'nothing sent while nothing is reached');
  });
  await ok('each alarm is sent once when reached, with the value now, then removed', async () => {
    chain.tip = 900002;
    await until(() => got.length === 1);
    assert.equal(got[0].body, 'Block 900,002 reached');
    assert.equal(got[0].click, 'http://node.local/');
    chain.fees.fastestFee = 2.94;
    await until(() => got.length === 2);
    assert.equal(got[1].body, 'Fees: next block 2,9 sat/vB (limit 3)');
    chain.prices.EUR = 49000;
    await until(() => got.length === 3);
    assert.equal(got[2].body, 'Price down to 50,000 EUR: now 49.000,0 EUR'); // as the app writes it (fmtPrice)
    await wait(2500);
    assert.equal(got.length, 3, 'not sent twice');
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'push.json'), 'utf8'));
    assert.equal(saved.clients.browser0001.alerts.length, 0);
  });
  await ok('an alarm sent back by the browser after it was sent is not sent again', async () => {
    chain.tip = 900001; // e.g. another server; the alarm at 900,002 is waiting again as far as heights go
    const r = await sync({
      id: 'browser0001',
      url: topic,
      alerts: [{ kind: 'height', height: 900002, msg: 'Block 900,002 reached' }],
    });
    assert.equal(r.json.watching, 0);
  });
  await ok('two browsers keep their own lists; turning one off removes only its alarms', async () => {
    await sync({ id: 'browser0001', url: topic, alerts: [{ kind: 'height', height: 900010, msg: 'one' }] });
    await sync({ id: 'browser0002', url: topic + '2', alerts: [{ kind: 'height', height: 900010, msg: 'two' }] });
    assert.equal((await sync({ id: 'browser0002', url: '' })).json.watching, 0);
    chain.tip = 900010;
    await until(() => got.length === 4);
    await wait(1500);
    assert.deepEqual(
      got.slice(3).map((x) => [x.path, x.body]),
      [['/bh-test', 'one']]
    );
  });
  await ok('a watched transaction is sent once it is in a block, with that block; a dropped one waits', async () => {
    const T1 = 'a'.repeat(64),
      T2 = 'b'.repeat(64);
    chain.txs[T1] = 0; // waiting; T2 unknown to the node
    const r = await sync({
      id: 'browser0003',
      url: topic,
      alerts: [
        { kind: 'tx', txid: T1, msg: 'Your transaction aaaa is confirmed, in block {now}' },
        { kind: 'tx', txid: T2, msg: 'never' },
        { kind: 'tx', txid: 'not-a-txid', msg: 'bad' },
      ],
    });
    assert.equal(r.json.watching, 2);
    const n = got.length;
    await wait(2500);
    assert.equal(got.length, n, 'nothing while it waits');
    chain.txs[T1] = 900011;
    await until(() => got.length === n + 1);
    assert.equal(got[n].body, 'Your transaction aaaa is confirmed, in block 900,011');
    await wait(2000);
    assert.equal(got.length, n + 1, 'once');
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'push.json'), 'utf8'));
    assert.deepEqual(
      saved.clients.browser0003.alerts.map((a) => a.txid),
      [T2]
    );
  });
} finally {
  ng.kill();
  mempool.close();
  ntfy.close();
}
if (failed) {
  console.log(
    fs
      .readFileSync(path.join(dir, 'error.log'), 'utf8')
      .split('\n')
      .filter((l) => /js|push|warn|error/i.test(l))
      .slice(-20)
      .join('\n')
  );
  process.exit(1);
}
