const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  sanitizeId,
  getWorktreeDir,
  getBranchName,
  parseWorktreeList,
  linkNodeModules,
  unlinkNodeModules,
  listWorktrees
} = require('./worktree_manager.js');

test('Worktree Manager: sanitizeId validates and cleans IDs', () => {
  assert.strictEqual(sanitizeId('issue-265'), 'issue-265');
  assert.strictEqual(sanitizeId('Issue_265'), 'issue_265');
  assert.strictEqual(sanitizeId('feat/tfr-update #42'), 'feat-tfr-update-42');
  assert.strictEqual(sanitizeId('---test-id---'), 'test-id');

  assert.throws(() => sanitizeId(''), /Worktree ID is required/);
  assert.throws(() => sanitizeId('   '), /Worktree ID is required/);
  assert.throws(() => sanitizeId('!@#$%^'), /Invalid worktree ID/);
});

test('Worktree Manager: getWorktreeDir resolves sibling directory', () => {
  const dummyRoot = path.join(os.tmpdir(), 'Aalaapi-Sky');
  const wtDir = getWorktreeDir('issue-265', dummyRoot);
  assert.strictEqual(path.basename(wtDir), 'Aalaapi-Sky-wt-issue-265');
  assert.strictEqual(path.dirname(wtDir), os.tmpdir());
});

test('Worktree Manager: getBranchName formats wt/ branch namespace', () => {
  assert.strictEqual(getBranchName('issue-265'), 'wt/issue-265');
  assert.strictEqual(getBranchName('Feat_Airspace'), 'wt/feat_airspace');
});

test('Worktree Manager: parseWorktreeList parses git worktree porcelain output', () => {
  const samplePorcelain = [
    'worktree /repo/main',
    'HEAD 1234567890abcdef',
    'branch refs/heads/main',
    '',
    'worktree /repo/wt-issue-265',
    'HEAD abcdef1234567890',
    'branch refs/heads/wt/issue-265',
    '',
    'worktree /repo/bare-repo',
    'bare',
    ''
  ].join('\n');

  const parsed = parseWorktreeList(samplePorcelain);
  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].path, '/repo/main');
  assert.strictEqual(parsed[0].branch, 'main');
  assert.strictEqual(parsed[0].bare, false);

  assert.strictEqual(parsed[1].path, '/repo/wt-issue-265');
  assert.strictEqual(parsed[1].branch, 'wt/issue-265');

  assert.strictEqual(parsed[2].path, '/repo/bare-repo');
  assert.strictEqual(parsed[2].bare, true);
});

test('Worktree Manager: linkNodeModules and unlinkNodeModules manages junctions safely without deleting source files', () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
  const mainDir = path.join(testRoot, 'main');
  const wtDir = path.join(testRoot, 'wt');

  fs.mkdirSync(path.join(mainDir, 'node_modules', 'fake-pkg'), { recursive: true });
  fs.writeFileSync(path.join(mainDir, 'node_modules', 'fake-pkg', 'package.json'), '{"name":"fake-pkg"}', 'utf8');
  fs.mkdirSync(wtDir, { recursive: true });

  try {
    // 1. Link
    const linkRes = linkNodeModules(mainDir, wtDir);
    assert.strictEqual(linkRes.linked, true, 'Link should succeed');

    const linkedFile = path.join(wtDir, 'node_modules', 'fake-pkg', 'package.json');
    assert.ok(fs.existsSync(linkedFile), 'File in linked node_modules must exist and be accessible');

    // 2. Unlink
    const unlinkRes = unlinkNodeModules(wtDir);
    assert.strictEqual(unlinkRes.unlinked, true, 'Unlink should succeed');

    // 3. Verify target main repo files are untouched!
    const originalFile = path.join(mainDir, 'node_modules', 'fake-pkg', 'package.json');
    assert.ok(fs.existsSync(originalFile), 'Original main repo node_modules must remain intact after unlinking');
  } finally {
    try {
      unlinkNodeModules(wtDir);
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch (_) {}
  }
});

test('Worktree Manager: listWorktrees returns current repository worktrees', () => {
  const list = listWorktrees(process.cwd());
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1, 'Current repository must have at least the main worktree');
  assert.ok(list[0].path.length > 0);
});
