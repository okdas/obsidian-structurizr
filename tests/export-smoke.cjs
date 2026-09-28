const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = process.env.STRUCTURIZR_CLI || 'structurizr-cli';
const example = path.resolve(__dirname, '../example-vault/architecture/order');
function exportWorkspace(workspace) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structurizr-smoke-'));
  const result = spawnSync(cli, ['export', '-workspace', workspace, '-format', 'static', '-output', dir], { encoding: 'utf8' });
  return { dir, result };
}

test('DSL workspace exports interactive static assets with every linked view', t => {
  const { dir, result } = exportWorkspace(path.join(example, 'workspace.dsl'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (result.error?.code === 'ENOENT') return t.skip(`Structurizr CLI not found: ${cli}`);
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(dir, 'workspace.js'), 'utf8');
  const workspace = Buffer.from(script.match(/jsonAsString = '([^']+)'/)[1], 'base64').toString('utf8');
  assert.match(html, /structurizr-diagram\.js/);
  for (const key of ['OrderContext', 'OrderContainers', 'OrderFlow']) assert.ok(workspace.includes(key), `missing view ${key}`);
  assert.ok(fs.existsSync(path.join(dir, 'js/structurizr-embed.js')));
});

test('note-selected second workspace exports its own linked views', t => {
  const source = path.resolve(__dirname, '../example-vault/architecture/payment/workspace.dsl');
  const { dir, result } = exportWorkspace(source);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (result.error?.code === 'ENOENT') return t.skip(`Structurizr CLI not found: ${cli}`);
  assert.equal(result.status, 0, result.stderr);
  const script = fs.readFileSync(path.join(dir, 'workspace.js'), 'utf8');
  const workspace = Buffer.from(script.match(/jsonAsString = '([^']+)'/)[1], 'base64').toString('utf8');
  assert.ok(workspace.includes('PaymentContext'));
  assert.ok(workspace.includes('PaymentContainers'));
});

test('workspace JSON with manual coordinates exports successfully', t => {
  const json = path.join(example, 'workspace.json');
  const source = JSON.parse(fs.readFileSync(json, 'utf8'));
  assert.ok(source.views.systemContextViews[0].elements.some(e => e.x !== 0 || e.y !== 0));
  assert.equal(source.views.systemContextViews[0].automaticLayout, undefined);
  const { dir, result } = exportWorkspace(json);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (result.error?.code === 'ENOENT') return t.skip(`Structurizr CLI not found: ${cli}`);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'index.html')));
});

test('invalid DSL fails export with a parser diagnostic', t => {
  const { dir, result } = exportWorkspace(path.resolve(__dirname, '../example-vault/architecture/broken/invalid.dsl'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (result.error?.code === 'ENOENT') return t.skip(`Structurizr CLI not found: ${cli}`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DslParserException|line/i);
});
