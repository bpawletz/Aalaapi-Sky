/**
 * tools/build/worktree_manager.js
 *
 * Automated Git Worktree Lifecycle Manager for Aalaapi Sky.
 * Enables pilots and AI agents to work on multiple features concurrently
 * in isolated filesystem workspaces without bundle overwrites, version collisions,
 * or git staging contamination.
 *
 * Commands:
 *   node tools/build/worktree_manager.js create <id>
 *   node tools/build/worktree_manager.js list
 *   node tools/build/worktree_manager.js finish <id> [--force]
 *   node tools/build/worktree_manager.js prune
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sanitizeId(rawId) {
  if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
    throw new Error('Worktree ID is required (e.g. "issue-265" or "feat-tfr")');
  }
  const clean = rawId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean) {
    throw new Error(`Invalid worktree ID: "${rawId}"`);
  }
  return clean;
}

function getWorktreeDir(id, rootDir = process.cwd()) {
  const cleanId = sanitizeId(id);
  const repoName = path.basename(rootDir);
  return path.resolve(rootDir, '..', `${repoName}-wt-${cleanId}`);
}

function getBranchName(id) {
  return `wt/${sanitizeId(id)}`;
}

function linkNodeModules(mainDir, wtDir) {
  const mainNm = path.join(mainDir, 'node_modules');
  const wtNm = path.join(wtDir, 'node_modules');

  if (!fs.existsSync(mainNm)) {
    return { linked: false, reason: 'main repo node_modules does not exist' };
  }

  // Check if target already has node_modules
  try {
    const stat = fs.lstatSync(wtNm);
    if (stat) return { linked: true, existed: true };
  } catch (_) {
    // does not exist, proceed with linking
  }

  try {
    const isWin = process.platform === 'win32';
    fs.symlinkSync(mainNm, wtNm, isWin ? 'junction' : 'dir');
    return { linked: true, existed: false };
  } catch (err) {
    return { linked: false, error: err.message };
  }
}

function unlinkNodeModules(wtDir) {
  const wtNm = path.join(wtDir, 'node_modules');
  try {
    const stat = fs.lstatSync(wtNm);
    if (!stat) return { unlinked: false, reason: 'not found' };

    if (stat.isSymbolicLink()) {
      fs.unlinkSync(wtNm);
      return { unlinked: true };
    }
    // On Windows, a directory junction reports as a directory under fs.statSync
    // but fs.rmdirSync removes only the link, not the contents of target.
    fs.rmdirSync(wtNm);
    return { unlinked: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { unlinked: false, reason: 'not found' };
    }
    return { unlinked: false, error: err.message };
  }
}

function parseWorktreeList(stdout) {
  const worktrees = [];
  const entries = stdout.trim().split(/\r?\n\r?\n/);

  for (const entry of entries) {
    if (!entry.trim()) continue;
    const lines = entry.split(/\r?\n/);
    const item = { path: '', head: '', branch: '', bare: false, locked: false, prunable: false };
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        item.path = line.slice(9).trim();
      } else if (line.startsWith('HEAD ')) {
        item.head = line.slice(5).trim();
      } else if (line.startsWith('branch ')) {
        item.branch = line.slice(7).replace(/^refs\/heads\//, '').trim();
      } else if (line === 'bare') {
        item.bare = true;
      } else if (line.startsWith('locked')) {
        item.locked = true;
      } else if (line.startsWith('prunable')) {
        item.prunable = true;
      }
    }
    if (item.path) {
      worktrees.push(item);
    }
  }
  return worktrees;
}

function createWorktree(id, rootDir = process.cwd()) {
  const cleanId = sanitizeId(id);
  const wtDir = getWorktreeDir(cleanId, rootDir);
  const branch = getBranchName(cleanId);

  if (fs.existsSync(wtDir)) {
    throw new Error(`Target worktree directory already exists: ${wtDir}`);
  }

  // Check if branch exists
  let branchExists = false;
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: rootDir, stdio: 'pipe' });
    branchExists = true;
  } catch (_) {
    branchExists = false;
  }

  const cmd = branchExists
    ? `git worktree add "${wtDir}" "${branch}"`
    : `git worktree add -b "${branch}" "${wtDir}" HEAD`;

  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

  // Link node_modules so dependencies and Playwright work immediately
  const linkResult = linkNodeModules(rootDir, wtDir);

  return {
    id: cleanId,
    worktreeDir: wtDir,
    branch,
    nodeModulesLinked: linkResult.linked
  };
}

function listWorktrees(rootDir = process.cwd()) {
  const raw = execSync('git worktree list --porcelain', { cwd: rootDir, encoding: 'utf8' });
  const list = parseWorktreeList(raw);

  // Check dirty status for each
  for (const wt of list) {
    if (wt.bare || !fs.existsSync(wt.path)) continue;
    try {
      const status = execSync('git status --porcelain', { cwd: wt.path, encoding: 'utf8' }).trim();
      wt.isDirty = status.length > 0;
      wt.dirtyCount = status ? status.split('\n').length : 0;
    } catch (_) {
      wt.isDirty = false;
    }
  }
  return list;
}

function finishWorktree(id, options = {}, rootDir = process.cwd()) {
  const cleanId = sanitizeId(id);
  const branch = getBranchName(cleanId);
  const list = listWorktrees(rootDir);

  const target = list.find(w => {
    if (w.branch === branch) return true;
    const base = path.basename(w.path).toLowerCase();
    return base === `aalaapi-sky-wt-${cleanId}` || base.endsWith(`-wt-${cleanId}`);
  });

  const wtDir = target ? target.path : getWorktreeDir(cleanId, rootDir);

  if (!fs.existsSync(wtDir) && !target) {
    throw new Error(`Worktree for "${cleanId}" not found at ${wtDir}`);
  }

  // Verify dirty state
  if (fs.existsSync(wtDir)) {
    const status = execSync('git status --porcelain', { cwd: wtDir, encoding: 'utf8' }).trim();
    if (status && !options.force) {
      throw new Error(`Cannot finish worktree: ${status.split('\n').length} uncommitted file(s) exist in ${wtDir}. Use --force to discard.`);
    }
  }

  // Unlink node_modules safely
  unlinkNodeModules(wtDir);

  // Remove worktree
  if (fs.existsSync(wtDir)) {
    execSync(`git worktree remove ${options.force ? '--force' : ''} "${wtDir}"`, { cwd: rootDir, stdio: 'inherit' });
  }

  // Delete local branch if requested/possible
  let branchDeleted = false;
  try {
    execSync(`git branch ${options.force ? '-D' : '-d'} "${branch}"`, { cwd: rootDir, stdio: 'pipe' });
    branchDeleted = true;
  } catch (_) {
    // Might not be fully merged or already deleted
  }

  // Prune references
  execSync('git worktree prune', { cwd: rootDir, stdio: 'pipe' });

  return {
    id: cleanId,
    worktreeDir: wtDir,
    branch,
    branchDeleted,
    removed: true
  };
}

function pruneWorktrees(rootDir = process.cwd()) {
  const out = execSync('git worktree prune -v', { cwd: rootDir, encoding: 'utf8' });
  return { output: out.trim() };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : 'list';
  const targetId = args[1];
  const force = args.includes('--force') || args.includes('-f');

  try {
    switch (command) {
      case 'create':
      case 'new':
      case 'add': {
        if (!targetId) {
          console.error('Usage: node tools/build/worktree_manager.js create <worktree-id>');
          process.exit(1);
        }
        const res = createWorktree(targetId);
        console.log(`\x1b[32m✔ Worktree created successfully!\x1b[0m`);
        console.log(`  📁 Path:   ${res.worktreeDir}`);
        console.log(`  🌿 Branch: ${res.branch}`);
        console.log(`  📦 node_modules junction: ${res.nodeModulesLinked ? 'Linked (Zero Install Delay)' : 'None'}`);
        console.log(`\nTo start working:`);
        console.log(`  cd "${res.worktreeDir}"`);
        break;
      }

      case 'list':
      case 'ls': {
        const list = listWorktrees();
        console.log(`\x1b[36m🌲 Active Git Worktrees (${list.length}):\x1b[0m\n`);
        list.forEach((wt, idx) => {
          const status = wt.isDirty ? `\x1b[33m[Dirty: ${wt.dirtyCount} modified]\x1b[0m` : `\x1b[32m[Clean]\x1b[0m`;
          const isMain = idx === 0 ? ' \x1b[35m(Main Worktree)\x1b[0m' : '';
          console.log(`  ${idx + 1}. \x1b[1m${path.basename(wt.path)}\x1b[0m${isMain}`);
          console.log(`     Branch: ${wt.branch || '(detached)'}`);
          console.log(`     Path:   ${wt.path}`);
          console.log(`     Status: ${status}\n`);
        });
        break;
      }

      case 'finish':
      case 'rm':
      case 'cleanup':
      case 'delete': {
        if (!targetId) {
          console.error('Usage: node tools/build/worktree_manager.js finish <worktree-id> [--force]');
          process.exit(1);
        }
        const res = finishWorktree(targetId, { force });
        console.log(`\x1b[32m✔ Worktree "${res.id}" successfully finished and cleaned up!\x1b[0m`);
        console.log(`  🗑 Removed: ${res.worktreeDir}`);
        console.log(`  🌿 Branch:  ${res.branch} (${res.branchDeleted ? 'deleted' : 'retained'})`);
        break;
      }

      case 'prune': {
        const res = pruneWorktrees();
        console.log(`\x1b[32m✔ Worktrees pruned:\x1b[0m`);
        console.log(res.output || '  No stale worktrees to prune.');
        break;
      }

      default:
        console.error(`Unknown command: "${command}". Available commands: create, list, finish, prune`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\x1b[31m✖ Error:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  sanitizeId,
  getWorktreeDir,
  getBranchName,
  linkNodeModules,
  unlinkNodeModules,
  parseWorktreeList,
  createWorktree,
  listWorktrees,
  finishWorktree,
  pruneWorktrees
};
