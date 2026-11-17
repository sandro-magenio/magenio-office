'use strict';

// Every agent of a project may carry its own Team AI token. An agent without
// one keeps using the project token, so nobody is left without tools.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-teamai-agent-'));
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath, filename: electronPath, loaded: true,
  exports: { app: { getPath: () => userData, isPackaged: false,
    getAppPath: () => path.join(__dirname, '..') } }
};
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const {
  remoteAgentSecretRef, remoteSecretRef, resolveRemoteProject
} = loadTs('src/shared/mcpCatalog.ts');
const {
  createRemoteTokenOps, createAgentTokenResolver
} = loadTs('src/main/remoteTokens.ts');

const FAKE_AGENT_TOKEN = 'TOKEN_AGENT_FAKE_1';
const FAKE_AGENT_TOKEN_B = 'TOKEN_AGENT_FAKE_2';
const FAKE_PROJECT_TOKEN = 'TOKEN_PROJECT_FAKE_1';

function store(initial = []) {
  const secrets = new Map(initial);
  return {
    secrets,
    deps: {
      setSecret: (ref, token) => { secrets.set(ref, token); return { ok: true }; },
      deleteSecret: (ref) => secrets.delete(ref),
      hasSecret: (ref) => secrets.has(ref),
      getSecret: (ref) => secrets.get(ref),
      urlFor: () => 'http://172.30.0.7:8080/mcp',
      checkToken: async () => 'valid'
    }
  };
}

const consent = (project, agents) => ({
  enabled: true, projects: { [project]: { url: 'http://172.30.0.7:8080/mcp', agents } }
});

test('the agent secret ref is the project ref plus the agent id', () => {
  assert.equal(remoteAgentSecretRef('teamai', 'BURD', 'agent-a'), 'mcp:teamai:BURD:agent-a');
  assert.notEqual(remoteAgentSecretRef('teamai', 'BURD', 'agent-a'), remoteSecretRef('teamai', 'BURD'));
});

test('an invalid agent id has no secret ref at all', () => {
  for (const agentId of ['../x', '', 'constructor', '__proto__', 'toString', 'a b', '-x', 'x'.repeat(256)]) {
    assert.equal(remoteAgentSecretRef('teamai', 'BURD', agentId), undefined, String(agentId));
  }
});

test('an unknown remote has no agent secret ref', () => {
  assert.equal(remoteAgentSecretRef('trello', 'BURD', 'agent-a'), undefined);
});

test('the upstream uses the agent token when it exists and the project one otherwise', () => {
  const { secrets, deps } = store([['mcp:teamai:BURD', FAKE_PROJECT_TOKEN]]);
  const { secrets: secrets2, deps: deps2 } = store([
    ['mcp:teamai:BURD', FAKE_PROJECT_TOKEN], ['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN]]);
  const own = createAgentTokenResolver(deps2)('teamai', 'BURD', 'agent-a');
  assert.equal(own, FAKE_AGENT_TOKEN);
  assert.equal(createAgentTokenResolver(deps)('teamai', 'BURD', 'agent-a'), FAKE_PROJECT_TOKEN);
  assert.equal(secrets.has('mcp:teamai:BURD'), true);
  assert.equal(secrets2.size, 2);
});

test('an agent token never leaks to another agent or another project', () => {
  const { deps } = store([
    ['mcp:teamai:BURD', FAKE_PROJECT_TOKEN],
    ['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN],
    ['mcp:teamai:SHOP:agent-a', FAKE_AGENT_TOKEN_B]]);
  const resolve = createAgentTokenResolver(deps);
  assert.equal(resolve('teamai', 'BURD', 'agent-a'), FAKE_AGENT_TOKEN);
  assert.equal(resolve('teamai', 'BURD', 'agent-b'), FAKE_PROJECT_TOKEN);
  assert.equal(resolve('teamai', 'SHOP', 'agent-a'), FAKE_AGENT_TOKEN_B);
  assert.equal(resolve('n8n', 'BURD', 'agent-a'), undefined);
});

test('an agent that left the list receives no upstream at all, even with its secret left', () => {
  const { deps } = store([
    ['mcp:teamai:BURD', FAKE_PROJECT_TOKEN], ['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN]]);
  const resolve = createAgentTokenResolver(deps);
  assert.equal(resolve('teamai', 'BURD', 'agent-a'), FAKE_AGENT_TOKEN);
  // The listing is what enables the agent: unchanged, fail closed.
  assert.equal(resolveRemoteProject('teamai', consent('BURD', ['agent-b']), 'BURD', 'agent-a'), null);
  assert.equal(resolveRemoteProject('teamai', consent('BURD', []), 'BURD', 'agent-a'), null);
  assert.equal(resolveRemoteProject('teamai', undefined, 'BURD', 'agent-a'), null);
});

test('the operator surface writes, tests and clears one agent at a time', async () => {
  const { secrets, deps } = store();
  const ops = createRemoteTokenOps(deps);
  assert.deepEqual(ops.setFor('teamai', 'BURD', 'agent-a', FAKE_AGENT_TOKEN), { ok: true });
  assert.equal(secrets.get('mcp:teamai:BURD:agent-a'), FAKE_AGENT_TOKEN);
  assert.equal(secrets.has('mcp:teamai:BURD'), false, 'the project token is untouched');
  assert.equal(ops.hasFor('teamai', 'BURD', 'agent-a'), true);
  assert.equal(ops.hasFor('teamai', 'BURD', 'agent-b'), false);
  assert.equal(await ops.testFor('teamai', 'BURD', 'agent-a'), 'valid');
  assert.deepEqual(ops.setFor('teamai', 'BURD', '../x', FAKE_AGENT_TOKEN), { ok: false, error: 'invalid remote, project or agent' });
  assert.deepEqual(ops.clearFor('teamai', 'BURD', 'agent-a'), { ok: true });
  assert.equal(await ops.testFor('teamai', 'BURD', 'agent-a'), 'missing');
});

test('the ops never hand a bearer back to the renderer', async () => {
  const { deps } = store([['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN]]);
  const ops = createRemoteTokenOps(deps);
  const surface = JSON.stringify([
    await ops.testFor('teamai', 'BURD', 'agent-a'),
    ops.hasFor('teamai', 'BURD', 'agent-a'),
    ops.setFor('teamai', 'BURD', 'agent-b', FAKE_AGENT_TOKEN_B),
    ops.clearFor('teamai', 'BURD', 'agent-b')
  ]);
  assert.equal(surface.includes(FAKE_AGENT_TOKEN), false);
  assert.equal(surface.includes(FAKE_AGENT_TOKEN_B), false);
});

test('an agent leaving the list or the project losing its connector prunes the secret', () => {
  const { secrets, deps } = store([
    ['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN],
    ['mcp:teamai:BURD:agent-b', FAKE_AGENT_TOKEN_B],
    ['mcp:teamai:BURD', FAKE_PROJECT_TOKEN]]);
  const ops = createRemoteTokenOps(deps);
  const removed = ops.pruneAgents('teamai', 'BURD', ['agent-a', 'agent-b'], ['agent-b']);
  assert.deepEqual(removed, ['agent-a']);
  assert.equal(secrets.has('mcp:teamai:BURD:agent-a'), false);
  assert.equal(secrets.has('mcp:teamai:BURD:agent-b'), true);
  assert.equal(secrets.has('mcp:teamai:BURD'), true, 'the project token survives');
  const all = ops.pruneAgents('teamai', 'BURD', ['agent-b'], []);
  assert.deepEqual(all, ['agent-b']);
  assert.equal(secrets.has('mcp:teamai:BURD:agent-b'), false);
});

test('main wires the per-agent upstream, IPC and preload', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/index.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload/index.ts'), 'utf8');
  assert.ok(/createAgentTokenResolver\(/.test(main), 'index.ts resolves agent tokens through the tested helper');
  assert.ok(/remoteAgentSecretRef/.test(main) || /createAgentTokenResolver/.test(main));
  for (const method of ['SetToken', 'ClearToken', 'HasToken', 'TestToken']) {
    assert.ok(new RegExp(`mcp:remoteAgent${method}`).test(main), `${method} IPC registered`);
    assert.ok(new RegExp(`mcpRemoteAgent${method}`).test(preload), `${method} preload exposed`);
  }
  // The broker still learns who calls, and its file is untouched by this feature.
  assert.ok(/remoteUpstream: \(id, agentId, project\)/.test(main), 'the upstream still receives the agent');
});

test('the settings panel offers a personal token per agent and all locales have the labels', () => {
  const panel = fs.readFileSync(
    path.join(__dirname, '../src/renderer/src/components/McpDefaultsSettings.tsx'), 'utf8');
  assert.ok(/mcpRemoteAgentSetToken/.test(panel), 'panel saves an agent token');
  assert.ok(/mcpRemoteAgentClearToken/.test(panel), 'panel clears an agent token');
  assert.ok(/mcpRemoteAgentTestToken/.test(panel), 'panel tests an agent token');
  assert.ok(/mcpDefaults\.remoteAgentToken/.test(panel), 'panel labels the agent token field');
  const locales = path.join(__dirname, '../src/renderer/src/i18n/locales');
  for (const file of fs.readdirSync(locales).filter((f) => f.endsWith('.json'))) {
    const dict = JSON.parse(fs.readFileSync(path.join(locales, file), 'utf8'));
    const flat = JSON.stringify(dict);
    assert.ok(flat.includes('remoteAgentToken'), `${file} has the agent token labels`);
    assert.ok(flat.includes('remoteAgentUsesProject'), `${file} says the project token is used`);
  }
});

// ─── Edge cases: project ref, panel reload, orphans ──────────────────────────

test('the agent secret ref validates the project too', () => {
  // The isolation must not depend on a check made elsewhere.
  assert.equal(remoteAgentSecretRef('teamai', 'p:x', 'b'), undefined);
  assert.equal(remoteAgentSecretRef('teamai', 'constructor', 'b'), undefined);
  assert.equal(remoteAgentSecretRef('teamai', '', 'b'), undefined);
  assert.equal(remoteAgentSecretRef('teamai', 'BURD', 'b'), 'mcp:teamai:BURD:b');
});

test('the panel reloads the agent state when the agent list changes', () => {
  // Without the agent ids in the key, removing and re-adding an agent leaves
  // "set" a token the cleanup has deleted.
  const { agentTokenRowsKey } = loadTs('src/shared/mcpAgentTokenRows.ts');
  const one = { teamai: { projects: { BURD: { agents: ['agent-a'] } } } };
  const removed = { teamai: { projects: { BURD: { agents: [] } } } };
  const readded = { teamai: { projects: { BURD: { agents: ['agent-a'] } } } };
  const other = { teamai: { projects: { BURD: { agents: ['agent-b'] } } } };
  assert.notEqual(agentTokenRowsKey(one), agentTokenRowsKey(removed));
  assert.notEqual(agentTokenRowsKey(one), agentTokenRowsKey(other));
  assert.equal(agentTokenRowsKey(one), agentTokenRowsKey(readded));
  assert.equal(agentTokenRowsKey(undefined), '');
  const panel = fs.readFileSync(
    path.join(__dirname, '../src/renderer/src/components/McpDefaultsSettings.tsx'), 'utf8');
  assert.ok(/agentTokenRowsKey/.test(panel), 'the panel keys the reload on the agent list');
});

test('the cleanup removes orphan agent secrets of a project', () => {
  // The secret store can list its references, so the orphans (agent no longer
  // listed, secret left behind) are deleted.
  const { secrets, deps } = store([
    ['mcp:teamai:BURD', FAKE_PROJECT_TOKEN],
    ['mcp:teamai:BURD:agent-a', FAKE_AGENT_TOKEN],
    ['mcp:teamai:BURD:ghost', FAKE_AGENT_TOKEN_B],
    ['mcp:teamai:SHOP:ghost', FAKE_AGENT_TOKEN_B]]);
  const ops = createRemoteTokenOps({ ...deps, listRefs: () => Array.from(secrets.keys()) });
  const removed = ops.pruneOrphans('teamai', 'BURD', ['agent-a']);
  assert.deepEqual(removed.sort(), ['ghost']);
  assert.equal(secrets.has('mcp:teamai:BURD:ghost'), false);
  assert.equal(secrets.has('mcp:teamai:BURD:agent-a'), true);
  assert.equal(secrets.has('mcp:teamai:BURD'), true, 'the project token stays');
  assert.equal(secrets.has('mcp:teamai:SHOP:ghost'), true, 'another project is not touched');
});

test('without a listing capability the cleanup reports it instead of guessing', () => {
  const { deps } = store([['mcp:teamai:BURD:ghost', FAKE_AGENT_TOKEN]]);
  const ops = createRemoteTokenOps(deps);
  assert.deepEqual(ops.pruneOrphans('teamai', 'BURD', []), []);
});

test('an invalid connector id makes the orphan cleanup do nothing', () => {
  // Same guard as remoteSecretRef(id, project): a hand-made id must delete
  // nothing, even when the prefix happens to match.
  const { secrets, deps } = store([
    ['mcp:teamai:p:BURD:ghost', FAKE_AGENT_TOKEN],
    ['mcp:teamai:BURD:ghost', FAKE_AGENT_TOKEN_B]]);
  const ops = createRemoteTokenOps({ ...deps, listRefs: () => Array.from(secrets.keys()) });
  assert.deepEqual(ops.pruneOrphans('teamai:p', 'BURD', []), []);
  assert.equal(secrets.has('mcp:teamai:p:BURD:ghost'), true);
  assert.equal(secrets.has('mcp:teamai:BURD:ghost'), true);
  // and the good id keeps working
  assert.deepEqual(ops.pruneOrphans('teamai', 'BURD', []).sort(), ['ghost']);
});
