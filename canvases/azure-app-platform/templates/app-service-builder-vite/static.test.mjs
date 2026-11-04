import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

test('single static component uses the default repository root path', async () => {
  assert.equal(await readFile(new URL('./builder.yaml', import.meta.url), 'utf8'), `components:
  - name: site
    role: static
    platform: nodejs
    platformVersion: "24"
    output: dist
`);
});

test('built static site serves its root, assets, and health check', { timeout: 15000 }, async (t) => {
  const entries = await readdir(new URL('./dist/', import.meta.url));
  assert.deepEqual(entries.sort(), ['assets', 'health', 'index.html']);
  assert.equal(await readFile(new URL('./dist/health', import.meta.url), 'utf8'), 'OK\n');

  const preview = spawn(process.execPath, [
    fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url)),
    'preview', '--host', '127.0.0.1', '--port', '0', '--strictPort',
  ], {
    cwd: new URL('.', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => preview.once('close', resolve));
  t.after(async () => {
    if (preview.exitCode === null && preview.signalCode === null) {
      preview.kill('SIGTERM');
    }
    await closed;
  });

  const origin = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Preview did not become ready: ${output}`)), 10000);
    const finish = (error, url) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(url);
    };
    preview.once('error', (error) => finish(error));
    preview.once('close', (code) => finish(new Error(`Preview exited (${code}): ${output}`)));
    preview.stderr.on('data', (chunk) => { output += chunk.toString(); });
    preview.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const url = stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      if (url) finish(null, url);
    });
  });

  const root = await fetch(origin);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /text\/html/);
  const html = await root.text();
  assert.match(html, /<h1>App Service Builder \/ vite-static<\/h1>/);
  assert.match(html, /<p id="greeting"><\/p>/);
  assert.doesNotMatch(html, /\/src\/|node_modules/);

  const assets = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(assets.length, 1);
  for (const asset of assets) {
    assert.match(asset, /^\/assets\/[^/]+\.js$/);
    const response = await fetch(new URL(asset, origin));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    const script = await response.text();
    assert.match(script, /\.textContent=/);
  }

  const health = await fetch(new URL('/health', origin));
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'OK\n');
});
