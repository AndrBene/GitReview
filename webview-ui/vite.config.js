import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function git(repoPath, command) {
  return execSync(`git -C "${repoPath}" ${command}`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function isGitRepo(repoPath) {
  try { git(repoPath, 'rev-parse --git-dir'); return true; } catch { return false; }
}

function jsonRes(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function gitApiPlugin() {
  return {
    name: 'git-api',
    configureServer(server) {
      const mw = server.middlewares;

      // GET /api/repo-info?path=...
      mw.use('/api/repo-info', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = new URL(req.url, 'http://localhost');
        const repoPath = url.searchParams.get('path');
        if (!repoPath) return jsonRes(res, { error: 'Missing path' }, 400);
        const absPath = path.resolve(repoPath);
        if (!fs.existsSync(absPath)) return jsonRes(res, { error: 'Path does not exist' }, 400);
        if (!isGitRepo(absPath)) return jsonRes(res, { error: 'Not a git repository' }, 400);
        try {
          let remoteBranches = [];
          try {
            remoteBranches = git(absPath, 'branch -r --format=%(refname:short)')
                .split('\n').map(b => b.trim()).filter(Boolean).filter(b => !b.includes('HEAD'));
          } catch {}
          if (remoteBranches.length === 0)
            return jsonRes(res, { error: 'No remote branches found. Run git fetch --all first.' }, 400);
          jsonRes(res, { repoName: path.basename(absPath), branches: remoteBranches });
        } catch (err) { jsonRes(res, { error: err.message }, 500); }
      });

      // GET /api/diff?path=...&source=...&target=...
      mw.use('/api/diff', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = new URL(req.url, 'http://localhost');
        const repoPath = url.searchParams.get('path');
        const source   = url.searchParams.get('source');
        const target   = url.searchParams.get('target');
        if (!repoPath || !source || !target) return jsonRes(res, { error: 'Missing params' }, 400);
        const absPath = path.resolve(repoPath);
        if (!isGitRepo(absPath)) return jsonRes(res, { error: 'Not a git repo' }, 400);
        try {
          const diffRaw = git(absPath, `diff "${target}"..."${source}" --unified=4 --no-color`);
          const changedFiles = git(absPath, `diff "${target}"..."${source}" --name-status`)
              .split('\n').filter(Boolean).map(line => {
                const parts = line.split('\t');
                const s = parts[0];
                const p = parts[parts.length - 1];
                return { status: s.startsWith('A') ? 'added' : s.startsWith('D') ? 'deleted' : s.startsWith('R') ? 'renamed' : 'modified', path: p };
              });
          const commits = git(absPath, `log "${target}".."${source}" --oneline --no-color`)
              .split('\n').filter(Boolean).map(line => {
                const idx = line.indexOf(' ');
                return { hash: line.substring(0, idx), message: line.substring(idx + 1) };
              });
          let statSummary = { additions: 0, deletions: 0 };
          try {
            const st = git(absPath, `diff "${target}"..."${source}" --shortstat`);
            const a = st.match(/(\d+) insertion/); const d = st.match(/(\d+) deletion/);
            if (a) statSummary.additions = parseInt(a[1]);
            if (d) statSummary.deletions = parseInt(d[1]);
          } catch {}
          jsonRes(res, { diff: diffRaw, changedFiles, commits, statSummary });
        } catch (err) { jsonRes(res, { error: err.message }, 500); }
      });

      // GET /api/fetch-remote?path=...
      // Runs git fetch --all --prune and returns updated branch list + reachability
      mw.use('/api/fetch-remote', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = new URL(req.url, 'http://localhost');
        const repoPath = url.searchParams.get('path');
        if (!repoPath) return jsonRes(res, { error: 'Missing path' }, 400);
        const absPath = path.resolve(repoPath);
        if (!isGitRepo(absPath)) return jsonRes(res, { error: 'Not a git repo' }, 400);
        try {
          // Try to fetch — this will fail if remote is unreachable
          try {
            execSync(`git -C "${absPath}" fetch --all --prune`, {
              encoding: 'utf8',
              timeout: 15000, // 15s timeout
              stdio: ['ignore', 'pipe', 'pipe'],
            });
          } catch (fetchErr) {
            // fetch failed — remote unreachable
            // Still return current cached branches so UI keeps working
            let branches = [];
            try {
              branches = git(absPath, 'branch -r --format=%(refname:short)')
                  .split('\n').map(b => b.trim()).filter(Boolean).filter(b => !b.includes('HEAD'));
            } catch {}
            return jsonRes(res, { reachable: false, branches, error: fetchErr.stderr || fetchErr.message });
          }
          // Fetch succeeded — return fresh branch list
          const branches = git(absPath, 'branch -r --format=%(refname:short)')
              .split('\n').map(b => b.trim()).filter(Boolean).filter(b => !b.includes('HEAD'));
          jsonRes(res, { reachable: true, branches });
        } catch (err) { jsonRes(res, { error: err.message }, 500); }
      });

      // GET /api/commit-diff?path=...&hashes=hash1,hash2,...
      mw.use('/api/commit-diff', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = new URL(req.url, 'http://localhost');
        const repoPath = url.searchParams.get('path');
        const hashes   = (url.searchParams.get('hashes') || '').split(',').map(h => h.trim()).filter(Boolean);
        if (!repoPath || hashes.length === 0) return jsonRes(res, { error: 'Missing params' }, 400);
        const absPath = path.resolve(repoPath);
        if (!isGitRepo(absPath)) return jsonRes(res, { error: 'Not a git repo' }, 400);
        try {
          let diffRaw = '';
          let changedFilesMap = {};
          // For multiple commits, diff from parent of oldest to newest
          if (hashes.length === 1) {
            diffRaw = git(absPath, `show "${hashes[0]}" --unified=4 --no-color --format=`).trimStart();
            git(absPath, `diff-tree --no-commit-id -r --name-status "${hashes[0]}"`)
                .split('\n').filter(Boolean).forEach(line => {
              const parts = line.split('\t');
              const s = parts[0];
              const p = parts[parts.length - 1];
              changedFilesMap[p] = s.startsWith('A') ? 'added' : s.startsWith('D') ? 'deleted' : s.startsWith('R') ? 'renamed' : 'modified';
            });
          } else {
            // Sort hashes by commit order (oldest first)
            const allHashes = hashes.join(' ');
            // diff from parent of first commit to last commit
            const oldest = hashes[hashes.length - 1];
            const newest = hashes[0];
            diffRaw = git(absPath, `diff "${oldest}^".."${newest}" --unified=4 --no-color`);
            git(absPath, `diff "${oldest}^".."${newest}" --name-status`)
                .split('\n').filter(Boolean).forEach(line => {
              const parts = line.split('\t');
              const s = parts[0];
              const p = parts[parts.length - 1];
              changedFilesMap[p] = s.startsWith('A') ? 'added' : s.startsWith('D') ? 'deleted' : s.startsWith('R') ? 'renamed' : 'modified';
            });
          }
          const changedFiles = Object.entries(changedFilesMap).map(([p, status]) => ({ path: p, status }));
          jsonRes(res, { diff: diffRaw, changedFiles });
        } catch (err) { jsonRes(res, { error: err.message }, 500); }
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), gitApiPlugin()],
  server: { port: 3000 },
  base: "./",   // ← critical: use relative paths
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Avoid hashed chunk filenames for easier loading
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    }
  }
});