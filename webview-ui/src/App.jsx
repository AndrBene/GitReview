import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { sendMessage } from './vscode';

// ── Theme context ─────────────────────────────────────────────────────────
const ThemeCtx = React.createContext(null);
function useTheme() { return React.useContext(ThemeCtx); }

// ── Local storage helpers ─────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Icons ─────────────────────────────────────────────────────────────────
function Icon({ d, size = 16, className = '', strokeWidth = 1.75 }) {
  return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
           className={className}>
        {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
      </svg>
  );
}

const IC = {
  git:     "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
  folder:  "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  branch:  "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  commit:  "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M3 12h6M15 12h6",
  plus:    "M12 5v14M5 12h14",
  minus:   "M5 12h14",
  search:  "m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  arrow:   "M5 12h14M12 5l7 7-7 7",
  chevron: "m6 9 6 6 6-6",
  chevronR:"m9 18 6-6-6-6",
  refresh: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5",
  split:   ["M16 3h5v5","M4 20 21 3","M21 16v5h-5","M15 15l6 6","M4 4l5 5"],
  file:    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  sun:     "M12 3v1m0 16v1M3 12h1m16 0h1m-3.22-7.78-.71.71M5.93 18.07l-.71.71m0-12.73.71.71m11.43 11.43.71.71M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z",
  moon:    "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  clock:   "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2",
  x:       "M18 6 6 18M6 6l12 12",
  check:   "M20 6 9 17l-5-5",
  warn:    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  wifiOff: "M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  panelL:  ["M3 3h18v18H3z","M9 3v18"],
  gripV:   "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
};

// ── Status helpers ────────────────────────────────────────────────────────
const STATUS = {
  added:    { letter: 'A', dark: 'text-green-400 bg-green-900/40',    light: 'text-green-700 bg-green-100'   },
  deleted:  { letter: 'D', dark: 'text-red-400 bg-red-900/40',       light: 'text-red-700 bg-red-100'       },
  modified: { letter: 'M', dark: 'text-amber-400 bg-amber-900/40',   light: 'text-amber-700 bg-amber-100'   },
  renamed:  { letter: 'R', dark: 'text-violet-400 bg-violet-900/40', light: 'text-violet-700 bg-violet-100' },
};
function statusCls(s, isDark) { return (STATUS[s] || STATUS.modified)[isDark ? 'dark' : 'light']; }

// ── BranchSelector ────────────────────────────────────────────────────────
function BranchSelector({ label, branches, value, onChange, exclude }) {
  const { isDark } = useTheme();
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const filtered = branches.filter(b => b !== exclude && b.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const base = isDark
      ? 'bg-[#1c2128] border-[#30363d] text-[#e6edf3] hover:border-[#58a6ff]'
      : 'bg-white border-[#d0d7de] text-[#1f2328] hover:border-[#0969da]';
  const dropdown = isDark
      ? 'bg-[#1f2630] border-[#30363d] shadow-2xl'
      : 'bg-white border-[#d0d7de] shadow-xl';
  const inputCls = isDark
      ? 'bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder-[#7b838c]'
      : 'bg-[#f6f8fa] border-[#d0d7de] text-[#1f2328] placeholder-[#8c959f]';

  return (
      <div ref={ref} className="relative w-60 min-w-0">
        <div className={`mb-1 text-[11px] font-mono uppercase tracking-widest ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`}>
          {label}
        </div>
        <button
            onClick={() => setOpen(!open)}
            title={value}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border font-mono text-xs transition-colors ${base} cursor-pointer`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Icon d={IC.branch} size={12} className={isDark ? 'text-[#58a6ff] shrink-0' : 'text-[#0969da] shrink-0'} />
            <span className="truncate">{value || 'Select…'}</span>
          </span>
          <Icon d={IC.chevron} size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`} />
        </button>

        {open && (
            <div className={`absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border overflow-hidden ${dropdown}`}>
              <div className="p-2">
                <div className="relative">
                  <Icon d={IC.search} size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`} />
                  <input
                      autoFocus value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Filter…"
                      className={`w-full pl-7 pr-2 py-1.5 rounded border text-xs font-mono outline-none ${inputCls}`}
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto pb-2 px-2">
                {filtered.length === 0
                    ? <div className={`text-xs text-center py-3 font-mono ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`}>No branches</div>
                    : filtered.map(b => (
                        <div
                            key={b} title={b}
                            onClick={() => { onChange(b); setOpen(false); setSearch(''); }}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                                b === value
                                    ? isDark ? 'bg-[#1f6feb22] text-[#58a6ff]' : 'bg-[#ddf4ff] text-[#0969da]'
                                    : isDark ? 'text-[#7d8590] hover:bg-[#1c2128] hover:text-[#e6edf3]' : 'text-[#656d76] hover:bg-[#f6f8fa] hover:text-[#1f2328]'
                            }`}
                        >
                          <Icon d={IC.branch} size={11} className="shrink-0" />
                          <span className="truncate">{b}</span>
                        </div>
                    ))
                }
              </div>
            </div>
        )}
      </div>
  );
}

// ── Resizable divider ─────────────────────────────────────────────────────
function ResizeHandle({ onDrag }) {
  const { isDark } = useTheme();
  const dragging = useRef(false);

  const onMouseDown = e => {
    e.preventDefault();
    dragging.current = true;
    const onMove = ev => { if (dragging.current) onDrag(ev.clientX); };
    const onUp   = ()  => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
      <div
          onMouseDown={onMouseDown}
          className={`resize-handle w-1 shrink-0 transition-colors ${isDark ? 'bg-[#21262d] hover:bg-[#58a6ff44]' : 'bg-[#e8eaed] hover:bg-[#0969da44]'}`}
      />
  );
}

// ── FileTree ──────────────────────────────────────────────────────────────
function FileTree({ files, activeFile, onSelect }) {
  const { isDark } = useTheme();
  return (
      <div className="font-mono text-xs">
        {files.map(f => (
            <div
                key={f.path} title={f.path}
                onClick={() => onSelect(f.path)}
                className={`flex items-center gap-2 px-3 py-1.5 mx-1 my-px rounded cursor-pointer transition-colors ${
                    activeFile === f.path
                        ? isDark ? 'bg-[#1f6feb22] text-[#58a6ff]' : 'bg-[#ddf4ff] text-[#0969da]'
                        : isDark ? 'text-[#7d8590] hover:bg-[#1c2128] hover:text-[#e6edf3]' : 'text-[#656d76] hover:bg-[#f6f8fa] hover:text-[#1f2328]'
                }`}
            >
          <span className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded text-[9px] font-bold ${statusCls(f.status, isDark)}`}>
            {STATUS[f.status]?.letter || 'M'}
          </span>
              <span className="truncate">{f.path.split('/').pop()}</span>
            </div>
        ))}
      </div>
  );
}

// ── CommitList ────────────────────────────────────────────────────────────
function CommitList({ commits, selectedHashes, onToggle, onClearSelection }) {
  const { isDark } = useTheme();
  const anySelected = selectedHashes.size > 0;

  return (
      <div>
        {anySelected && (
            <div className={`flex items-center justify-between px-3 py-1.5 text-[10px] font-mono ${isDark ? 'text-[#58a6ff]' : 'text-[#0969da]'}`}>
              <span>{selectedHashes.size} commit{selectedHashes.size > 1 ? 's' : ''} selected</span>
              <button onClick={onClearSelection} className="hover:underline cursor-pointer">clear</button>
            </div>
        )}
        {commits.map(c => {
          const sel = selectedHashes.has(c.hash);
          return (
              <div
                  key={c.hash}
                  onClick={() => onToggle(c.hash)}
                  title={c.message}
                  className={`flex items-center gap-2 px-3 py-2 mx-1 my-px rounded cursor-pointer transition-colors ${
                      sel
                          ? isDark ? 'bg-[#1f6feb22] ring-1 ring-[#1f6feb44]' : 'bg-[#ddf4ff] ring-1 ring-[#0969da33]'
                          : isDark ? 'hover:bg-[#1c2128]' : 'hover:bg-[#f6f8fa]'
                  }`}
              >
                <div className={`mt-px w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-colors ${
                    sel
                        ? isDark ? 'bg-[#1f6feb] border-[#1f6feb]' : 'bg-[#0969da] border-[#0969da]'
                        : isDark ? 'border-[#30363d]' : 'border-[#d0d7de]'
                }`}>
                  {sel && <Icon d={IC.check} size={9} className="text-white" strokeWidth={3} />}
                </div>
                <div className="min-w-0">
                  <code className={`text-[10px] ${isDark ? 'text-[#bc8cff]' : 'text-[#8250df]'}`}>{c.hash}</code>
                  <div className={`text-[10px] truncate ${isDark ? 'text-[#7d8590]' : 'text-[#656d76]'}`}>{c.message}</div>
                </div>
              </div>
          );
        })}
      </div>
  );
}

// ── RepoInput (home screen) ───────────────────────────────────────────────
function RepoInput({ onLoad }) {
  const { isDark } = useTheme();
  const [repoPath, setRepoPath]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [recents, setRecents]     = useState(() => LS.get('recentRepos', []));
  const folderInputRef = useRef(null);

  // Get workspace path from VS Code and auto-load if available
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'workspace-path' && event.data.path) {
        setRepoPath(event.data.path);
        // Auto-load the repo
        const trimmed = event.data.path.trim();
        if (trimmed) {
          loadRepo(trimmed);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    // Signal to extension that webview is ready
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'webview-ready' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadRepo = async (p) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const data = await sendMessage('repo-info', { path: trimmed });
      if (data.error) throw new Error(data.error);
      // save to recents
      const updated = [trimmed, ...recents.filter(r => r !== trimmed)].slice(0, 3);
      LS.set('recentRepos', updated);
      setRecents(updated);
      onLoad({ path: trimmed, ...data });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // When user picks a folder via the browser dialog, grab its path from the first file
  const handleFolderPick = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0];
    const relativePath = firstFile.webkitRelativePath || '';
    const folderName = relativePath.split('/')[0] || firstFile.name;

    // Check if we have access to the full file path
    if (!firstFile.path) {
      setError(`Unable to get full folder path from file picker. Please manually paste the path in the input field.`);
      e.target.value = '';
      return;
    }

    let absPath = folderName;
    if (relativePath) {
      // Normalize path separators (webkitRelativePath uses /, but firstFile.path uses \ on Windows)
      const normalizedRelativePath = relativePath.replace(/\//g, '\\');

      // Extract the folder path by removing the relative file path and keeping the folder name
      if (firstFile.path.includes(normalizedRelativePath)) {
        absPath = firstFile.path
          .substring(0, firstFile.path.length - normalizedRelativePath.length + folderName.length)
          .replace(/[/\\]$/, '');
      } else {
        // Fallback: find the folder name in the path and extract from there
        const idx = firstFile.path.lastIndexOf(folderName);
        if (idx !== -1) {
          absPath = firstFile.path.substring(0, idx + folderName.length);
        }
      }
    }
    setRepoPath(absPath);
    setError(''); // Clear any previous errors
    e.target.value = '';
  };

  const doLoad = (p) => loadRepo(p);

  const removeRecent = (e, p) => {
    e.stopPropagation();
    const updated = recents.filter(r => r !== p);
    LS.set('recentRepos', updated);
    setRecents(updated);
  };

  const surface = isDark ? 'bg-[#1f2630] border-[#30363d]' : 'bg-white border-[#d0d7de]';
  const inputCls = isDark
      ? 'bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder-[#7b838c] focus:border-[#58a6ff]'
      : 'bg-white border-[#d0d7de] text-[#1f2328] placeholder-[#8c959f] focus:border-[#0969da]';

  return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-[#0d1117]' : 'bg-[#f6f8fa]'}`}>
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className={`inline-flex items-center gap-3 px-5 py-3 rounded-2xl border mb-5 ${surface}`} style={{ boxShadow: isDark ? '0 0 0 1px rgba(88,166,255,0.06), 0 8px 32px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.08)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1f6feb, #58a6ff)' }}>
                <Icon d={IC.git} size={18} className="text-white" strokeWidth={2} />
              </div>
              <span className="font-sans font-extrabold text-xl tracking-tight" style={{ color: isDark ? '#e6edf3' : '#1f2328' }}>
              git<span style={{ color: isDark ? '#58a6ff' : '#0969da' }}>review</span>
            </span>
            </div>
            <p className={`text-sm ${isDark ? 'text-[#7d8590]' : 'text-[#656d76]'}`}>
              Local pull request viewer for on-premise git repos
            </p>
          </div>

          {/* Input card */}
          <div className={`rounded-xl border p-6 mb-4 ${surface}`} style={{ boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)' }}>
            <label className={`block mb-2 text-[10px] font-mono uppercase tracking-widest ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`}>
              Repository path
            </label>
            <form onSubmit={e => { e.preventDefault(); doLoad(repoPath); }} className="flex gap-2">
              {/* Hidden folder picker */}
              <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  onChange={handleFolderPick}
                  className="hidden"
              />
              <div className="relative flex-1">
                <Icon d={IC.folder} size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#7b838c]' : 'text-[#8c959f]'}`} />
                <input
                    value={repoPath} onChange={e => setRepoPath(e.target.value)}
                    placeholder="/path/to/your/repo"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border font-mono text-sm outline-none transition-colors ${inputCls}`}
                />
              </div>
              <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  title="Browse for folder"
                  className={`px-3 py-2.5 rounded-lg border font-sans text-sm transition-all ${isDark ? 'border-[#30363d] text-[#7d8590] hover:border-[#58a6ff] hover:text-[#58a6ff]' : 'border-[#d0d7de] text-[#656d76] hover:border-[#0969da] hover:text-[#0969da]'} cursor-pointer`}
              >
                <Icon d={IC.folder} size={15} />
              </button>
              <button
                  type="submit" disabled={loading || !repoPath.trim()}
                  className="px-5 py-2.5 rounded-lg font-sans font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{ background: isDark ? '#1f6feb' : '#0969da', color: '#fff' }}
              >
                {loading ? 'Loading…' : 'Open'}
              </button>
            </form>

            {error && (
                <div className="mt-3 px-4 py-2.5 rounded-lg text-xs font-mono" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                  {error}
                </div>
            )}
          </div>

          {/* Recents */}
          {recents.length > 0 && (
              <div className={`rounded-xl border overflow-hidden ${surface}`}>
                <div className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border-b ${isDark ? 'text-[#7b838c] border-[#21262d]' : 'text-[#8c959f] border-[#eaeef2]'}`}>
                  Recent repos
                </div>
                {recents.map((r, i) => (
                    <div
                        key={r}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${
                            i < recents.length - 1 ? (isDark ? 'border-b border-[#21262d]' : 'border-b border-[#eaeef2]') : ''
                        } ${isDark ? 'hover:bg-[#1c2128]' : 'hover:bg-[#f6f8fa]'}`}
                        onClick={() => doLoad(r)}
                    >
                      <Icon d={IC.clock} size={14} className={isDark ? 'text-[#7b838c] shrink-0' : 'text-[#8c959f] shrink-0'} />
                      <span className={`font-mono text-xs flex-1 truncate ${isDark ? 'text-[#7d8590] group-hover:text-[#e6edf3]' : 'text-[#656d76] group-hover:text-[#1f2328]'}`}>
                  {r}
                </span>
                      <button
                          onClick={e => removeRecent(e, r)}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${isDark ? 'hover:bg-[#30363d] text-[#7d8590]' : 'hover:bg-[#e8eaed] text-[#8c959f]'}`}
                      >
                        <Icon d={IC.x} size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                ))}
              </div>
          )}

          {/* <p className={`text-center mt-5 text-[10px] font-mono ${isDark ? 'text-[#30363d]' : 'text-[#d0d7de]'}`}>
            run git fetch --all before comparing
          </p> */}
        </div>
      </div>
  );
}

// ── Extension → hljs language map ─────────────────────────────────────────
const EXT_LANG = {
  // Web templates (hljs has no native support — map to closest approximation)
  jsp: 'xml', jspx: 'xml', jspf: 'xml',
  asp: 'xml', aspx: 'xml', ascx: 'xml',
  erb: 'xml', ejs: 'xml', hbs: 'handlebars',
  twig: 'xml', blade: 'xml', mustache: 'xml',
  // JVM
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy',
  // JS ecosystem
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  vue: 'xml', svelte: 'xml',
  // Web
  html: 'xml', htm: 'xml', xhtml: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less', sass: 'sass',
  // Data / config
  json: 'json', json5: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', env: 'bash',
  // Shell
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  bat: 'dos', cmd: 'dos', ps1: 'powershell',
  // Systems
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', fs: 'fsharp', fsx: 'fsharp',
  go: 'go', rs: 'rust', swift: 'swift',
  // Scripting
  py: 'python', rb: 'ruby', php: 'php', pl: 'perl', lua: 'lua', r: 'r',
  // DB
  sql: 'sql', pgsql: 'pgsql',
  // Docs
  md: 'markdown', mdx: 'markdown', tex: 'latex',
  // Misc
  dockerfile: 'dockerfile', makefile: 'makefile',
  tf: 'hcl', hcl: 'hcl', proto: 'protobuf',
  graphql: 'graphql', gql: 'graphql',
};

function getLang(filename) {
  if (!filename) return null;
  const base = filename.split('/').pop().toLowerCase();
  // Handle extensionless special filenames
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (base === '.env' || base.startsWith('.env.')) return 'bash';
  const ext = base.split('.').pop();
  const mapped = EXT_LANG[ext];
  if (!mapped) return null;
  // Verify hljs actually has it loaded
  return window.hljs?.getLanguage(mapped) ? mapped : null;
}

// ── FileDiff: renders a single file diff with syntax highlighting ──────────
function FileDiff({ rawDiff, viewMode, isDark }) {
  const containerRef = useRef(null);

  // Parse filename from the diff header (e.g. "diff --git a/foo/Bar.jsp b/foo/Bar.jsp")
  const filename = useMemo(() => {
    const m = rawDiff?.match(/diff --git a\/.+ b\/(.+)/);
    return m ? m[1].trim() : '';
  }, [rawDiff]);

  const lang = useMemo(() => getLang(filename), [filename]);

  // For mixed-content files (JSP, HTML, ERB…) we also want JS highlighting
  // inside <script> blocks. We track mode as we walk lines in DOM order.
  const isTemplateLang = lang === 'xml';

  const html = useMemo(() => Diff2Html.html(rawDiff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: viewMode === 'split' ? 'side-by-side' : 'line-by-line',
  }), [rawDiff, viewMode]);

  // After the HTML lands in the DOM, walk every code cell and highlight it
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.hljs) return;

    const hljs = window.hljs;

    // For template languages we walk lines in order and track <script>/<style> blocks
    let inScriptBlock = false;
    let inStyleBlock  = false;

    el.querySelectorAll('.d2h-code-line-ctn').forEach(span => {
      if (span.dataset.hljsDone) return;
      span.dataset.hljsDone = '1';

      // Decode HTML entities to get plain text
      const tmp = document.createElement('div');
      tmp.innerHTML = span.innerHTML;
      const plain = tmp.textContent ?? '';
      if (!plain.trim()) return;

      try {
        let activeLang = lang;

        if (isTemplateLang) {
          const lower = plain.toLowerCase().trimStart();
          // Detect block transitions
          if (/<script[\s>]/i.test(lower))  inScriptBlock = true;
          if (/<\/script>/i.test(lower))    inScriptBlock = false;
          if (/<style[\s>]/i.test(lower))   inStyleBlock  = true;
          if (/<\/style>/i.test(lower))     inStyleBlock  = false;

          if (inScriptBlock && !/<script[\s>]/i.test(lower)) activeLang = 'javascript';
          else if (inStyleBlock && !/<style[\s>]/i.test(lower)) activeLang = 'css';
        }

        const result = activeLang
            ? hljs.highlight(plain, { language: activeLang, ignoreIllegals: true })
            : hljs.highlightAuto(plain, Object.values(EXT_LANG));
        span.innerHTML = result.value;
      } catch {
        // leave as-is
      }

      // ── Post-process: recolor JSP scriptlet delimiters in orange ──
      // Walk all text nodes inside the span and wrap <%, <%=, %> tokens
      if (isTemplateLang) {
        colorizeJspDelimiters(span);
      }
    });
  }, [html, lang, isTemplateLang]);

  return (
      <div ref={containerRef}
           className={`d2h-wrapper ${isDark ? 'dark' : 'light'}`}
           dangerouslySetInnerHTML={{ __html: html }}
      />
  );
}

// Walks DOM text nodes inside `root` and wraps JSP delimiters with orange spans
function colorizeJspDelimiters(root) {
  const JSP_RE = /(<%=?|%>)/g;
  // Collect text nodes first to avoid mutating while iterating
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const tn of textNodes) {
    const val = tn.nodeValue;
    if (!JSP_RE.test(val)) continue;
    JSP_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = JSP_RE.exec(val)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
      const s = document.createElement('span');
      s.className = 'jsp-delim';
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  }
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => LS.get('theme', 'dark') === 'dark');

  useEffect(() => {
    LS.set('theme', isDark ? 'dark' : 'light');
    document.documentElement.className = isDark ? 'dark' : 'light';
  }, [isDark]);

  // set initial class
  useEffect(() => {
    document.documentElement.className = isDark ? 'dark' : 'light';
  }, []);

  const [repo, setRepo]               = useState(null);
  const [source, setSource]           = useState('');
  const [target, setTarget]           = useState('');
  const [diffData, setDiffData]       = useState(null);
  const [commitDiff, setCommitDiff]   = useState(null); // {diff, changedFiles}
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [activeFile, setActiveFile]   = useState(null);
  const [viewMode, setViewMode]       = useState('unified');
  const [showCommits, setShowCommits] = useState(true);
  const [selectedHashes, setSelectedHashes] = useState(new Set());
  const [sidebarWidth, setSidebarWidth]     = useState(260);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [collapsedFiles, setCollapsedFiles] = useState(new Set());
  const [remoteReachable, setRemoteReachable] = useState(true);
  const [lastFetched, setLastFetched]         = useState(null);
  const [fetchingRemote, setFetchingRemote]   = useState(false);
  const fetchingRef = useRef(false);
  const fileRefs    = useRef({});
  const bodyRef     = useRef(null);

  // Fetch remote branches (with reachability check)
  const fetchRemote = useCallback(async (repoPath) => {
    if (!repoPath || fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchingRemote(true);
    try {
      const data = await sendMessage('fetch-remote', { path: repoPath });
      const reachable = data.reachable === true;
      setRemoteReachable(reachable);
      if (data.branches?.length) {
        setRepo(prev => prev ? { ...prev, branches: data.branches } : prev);
      }
      if (reachable) setLastFetched(new Date());
    } catch {
      setRemoteReachable(false);
    } finally {
      fetchingRef.current = false;
      setFetchingRemote(false);
    }
  }, []); // no deps — uses ref for guard

  // Fetch remote branches once when repo is opened
  useEffect(() => {
    if (!repo) return;
    fetchRemote(repo.path);
  }, [repo?.path]); // eslint-disable-line

  // Reset branch selection when repo path changes (not on branch list refresh)
  const prevRepoPath = useRef(null);
  useEffect(() => {
    if (!repo) return;
    const pathChanged = prevRepoPath.current !== repo.path;
    prevRepoPath.current = repo.path;
    if (pathChanged) {
      const main  = repo.branches.find(b => b.endsWith('/devsilef2')) || repo.branches.find(b => b.endsWith('/main')) || repo.branches.find(b => b.endsWith('/master')) || repo.branches[0] || '';
      const other = repo.branches.find(b => b !== main) || '';
      setTarget(main); setSource(other);
      setDiffData(null); setCommitDiff(null); setSelectedHashes(new Set());
      setRemoteReachable(true); setLastFetched(null);
    }
  }, [repo]);

  const fetchDiff = async () => {
    if (!source || !target || source === target) return;
    setLoading(true); setError(''); setDiffData(null); setCommitDiff(null);
    setActiveFile(null); setSelectedHashes(new Set());
    try {
      const data = await sendMessage('diff', { path: repo.path, source, target });
      if (data.error) throw new Error(data.error);
      setDiffData(data);
      if (data.changedFiles.length > 0) setActiveFile(data.changedFiles[0].path);
      setCollapsedFiles(new Set());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Toggle commit selection & fetch commit diff
  const toggleCommit = useCallback(async (hash) => {
    setSelectedHashes(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  }, []);

  // Fetch commit diff whenever selectedHashes changes
  useEffect(() => {
    if (selectedHashes.size === 0) { setCommitDiff(null); return; }
    const hashes = [...selectedHashes];
    (async () => {
      setLoading(true);
      try {
        const data = await sendMessage('commit-diff', { path: repo.path, hashes });
        if (data.error) throw new Error(data.error);
        setCommitDiff(data);
        if (data.changedFiles.length > 0) setActiveFile(data.changedFiles[0].path);
        else setActiveFile(null);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [selectedHashes]);

  const clearCommitSelection = () => { setSelectedHashes(new Set()); setCommitDiff(null); };

  const scrollToFile = (filePath) => {
    setActiveFile(filePath);
    fileRefs.current[filePath]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Which diff to render: commit diff takes priority if commits selected
  const activeDiff = commitDiff || diffData;

  // Split raw diff into per-file chunks
  const diffByFile = useMemo(() => {
    if (!activeDiff?.diff) return {};
    const result = {};
    const parts  = activeDiff.diff.split(/(?=^diff --git )/m);
    for (const part of parts) {
      if (!part.startsWith('diff --git')) continue;
      const match = part.match(/diff --git a\/.+ b\/(.+)/);
      if (!match) continue;
      result[match[1]] = part;
    }
    return result;
  }, [activeDiff]);

  // Switch highlight.js theme when dark/light changes
  useEffect(() => {
    const dark  = document.getElementById('hljs-dark');
    const light = document.getElementById('hljs-light');
    if (dark)  dark.disabled  = !isDark;
    if (light) light.disabled = isDark;
  }, [isDark]);

  // Resize
  const handleResize = useCallback((clientX) => {
    if (!bodyRef.current) return;
    const rect = bodyRef.current.getBoundingClientRect();
    const newW = Math.max(180, Math.min(480, clientX - rect.left));
    setSidebarWidth(newW);
  }, []);

  if (!repo) return (
      <ThemeCtx.Provider value={{ isDark, setIsDark }}>
        <RepoInput onLoad={setRepo} />
        <ThemeToggle />
      </ThemeCtx.Provider>
  );

  const canCompare  = source && target && source !== target;
  const surface     = isDark ? 'bg-[#1f2630]'    : 'bg-white';
  const border      = isDark ? 'border-[#30363d]' : 'border-[#d0d7de]';
  const textMuted   = isDark ? 'text-[#7d8590]'  : 'text-[#656d76]';
  const textDim     = isDark ? 'text-[#7b838c]'  : 'text-[#8c959f]';
  const bgPage      = isDark ? 'bg-[#0d1117]'    : 'bg-[#f6f8fa]';
  const bgSurface2  = isDark ? 'bg-[#1c2128]'    : 'bg-[#f6f8fa]';

  return (
      <ThemeCtx.Provider value={{ isDark, setIsDark }}>
        <div className={`flex flex-col h-screen overflow-hidden font-sans ${bgPage} ${isDark ? 'text-[#e6edf3]' : 'text-[#1f2328]'}`}>

          {/* ── Header ── */}
          <header className={`flex items-center gap-3 px-4 py-4 h-auto shrink-0 border-b rounded-b-lg ${surface} ${border}`}>
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1f6feb, #58a6ff)' }}>
                <Icon d={IC.git} size={14} className="text-white" strokeWidth={2} />
              </div>
              <span className="font-extrabold text-sm tracking-tight">
              git<span style={{ color: isDark ? '#58a6ff' : '#0969da' }}>review</span>
            </span>
            </div>

            <div className={`w-px h-5 shrink-0 ${isDark ? 'bg-[#30363d]' : 'bg-[#d0d7de]'}`} />

            {/* Repo name */}
            <div className={`flex items-center gap-1.5 shrink-0 text-xs font-mono ${textMuted}`}>
              <Icon d={IC.folder} size={13} />
              <span>{repo.repoName}</span>
            </div>

            <div className="flex-1" />

            {/* Branch selectors */}
            <div className="flex items-center gap-2 min-w-0 max-w-4xl">
              <BranchSelector label="base"    branches={repo.branches} value={target} onChange={setTarget} exclude={source} />
              <div className={`flex items-center justify-center shrink-0 h-8 self-start mt-6 ${textDim}`}>
                <Icon d={IC.arrow} size={15} />
              </div>
              <BranchSelector label="compare" branches={repo.branches} value={source} onChange={setSource} exclude={target} />
            </div>

            <button
                onClick={fetchDiff} disabled={!canCompare || loading}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ background: isDark ? '#1f6feb' : '#0969da', color: '#fff' }}
            >
              {loading ? 'Loading…' : 'Compare'}
            </button>

            <div className="flex-1" />

            {/* Theme toggle */}
            <button
                onClick={() => setIsDark(!isDark)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isDark ? 'border-[#30363d] text-[#7d8590] hover:border-[#58a6ff] hover:text-[#58a6ff]' : 'border-[#d0d7de] text-[#656d76] hover:border-[#0969da] hover:text-[#0969da]'} cursor-pointer`}
            >
              <Icon d={isDark ? IC.sun : IC.moon} size={14} />
            </button>

            {/* Change repo */}
            <button
                onClick={() => { setRepo(null); setDiffData(null); setCommitDiff(null); }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isDark ? 'border-[#30363d] text-[#7d8590] hover:border-[#7d8590] hover:text-[#e6edf3]' : 'border-[#d0d7de] text-[#656d76] hover:border-[#8c959f] hover:text-[#1f2328]'} cursor-pointer`}
                title="Open different repo"
            >
              <Icon d={IC.folder} size={14} />
            </button>

            {/* Fetch status indicator */}
            <button
                onClick={() => fetchRemote(repo.path)}
                disabled={fetchingRemote}
                title={fetchingRemote ? 'Fetching…' : lastFetched ? `Last fetched ${lastFetched.toLocaleTimeString()}` : 'Fetch remote'}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors  cursor-pointer ${
                    remoteReachable === false
                        ? 'border-amber-400/50 text-amber-400 hover:bg-amber-400/10'
                        : isDark ? 'border-[#30363d] text-[#7b838c] hover:border-[#30363d] hover:text-[#7d8590]' : 'border-[#d0d7de] text-[#8c959f] hover:text-[#656d76]'
                }`}
            >
              <Icon d={remoteReachable === false ? IC.wifiOff : IC.refresh} size={14}
                    className={fetchingRemote ? 'animate-spin' : ''} />
            </button>
          </header>

          {/* ── Remote unreachable warning banner ── */}
          {remoteReachable === false && (
              <div className="flex items-center gap-3 px-4 py-2 shrink-0 text-xs font-mono"
                   style={{ background: isDark ? 'rgba(210,153,34,0.12)' : 'rgba(154,103,0,0.08)', borderBottom: `1px solid ${isDark ? 'rgba(210,153,34,0.3)' : 'rgba(154,103,0,0.2)'}` }}>
                <Icon d={IC.warn} size={14} className="text-amber-400 shrink-0" />
                <span className={isDark ? 'text-amber-300' : 'text-amber-700'}>
              Remote is unreachable — you may be off VPN. Showing cached branches. Changes since last fetch won't appear.
            </span>
                <button
                    onClick={() => fetchRemote(repo.path)}
                    disabled={fetchingRemote}
                    className={`ml-auto shrink-0 px-2.5 py-1 rounded border transition-colors cursor-pointer ${isDark ? 'border-amber-400/40 text-amber-400 hover:bg-amber-400/10' : 'border-amber-600/40 text-amber-700 hover:bg-amber-600/10'}`}
                >
                  {fetchingRemote ? 'Retrying…' : 'Retry'}
                </button>
              </div>
          )}
          <div ref={bodyRef} className="flex flex-1 overflow-hidden">

            {/* Sidebar toggle button (when closed) */}
            {!sidebarOpen && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className={`flex flex-col items-center justify-center w-8 shrink-0 border-r transition-colors ${surface} ${border} ${isDark ? 'text-[#7b838c] hover:text-[#58a6ff] hover:bg-[#1c2128]' : 'text-[#8c959f] hover:text-[#0969da] hover:bg-[#f6f8fa]'}`}
                    title="Show sidebar"
                >
                  <Icon d={IC.chevronR} size={14} />
                </button>
            )}

            {/* ── Sidebar ── */}
            {sidebarOpen && activeDiff && (
                <>
                  <aside
                      className={`flex flex-col shrink-0 overflow-hidden border-r ${surface} ${border}`}
                      style={{ width: sidebarWidth }}
                  >
                    {/* Sidebar header */}
                    <div className={`flex items-center justify-between px-3 py-2 border-b shrink-0 ${isDark ? 'border-[#21262d]' : 'border-[#eaeef2]'}`}>
                      <span className={`text-[10px] font-mono uppercase tracking-widest ${textDim}`}>Overview</span>
                      <button
                          onClick={() => setSidebarOpen(false)}
                          className={`p-1 rounded transition-colors ${isDark ? 'text-[#7b838c] hover:text-[#7d8590] hover:bg-[#1c2128]' : 'text-[#8c959f] hover:text-[#656d76] hover:bg-[#f6f8fa]'} cursor-pointer`}
                      >
                        <Icon d={IC.panelL} size={13} />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {/* Stats */}
                      <div className={`px-3 pt-3 pb-2 border-b ${isDark ? 'border-[#21262d]' : 'border-[#eaeef2]'}`}>
                        <div className="flex gap-2 mb-2">
                          {[['FILES', activeDiff.changedFiles.length], ['COMMITS', diffData?.commits?.length || 0]].map(([lbl, val]) => (
                              <div key={lbl} className={`flex-1 rounded-lg p-2 border ${bgSurface2} ${border}`}>
                                <div className={`text-[9px] font-mono uppercase tracking-wider mb-0.5 ${textDim}`}>{lbl}</div>
                                <div className="text-base font-bold font-mono">{val}</div>
                              </div>
                          ))}
                        </div>
                        <div className="flex gap-3">
                      <span className="flex items-center gap-1 text-xs font-mono text-green-500">
                        <Icon d={IC.plus} size={11} strokeWidth={2.5} />
                        {activeDiff.statSummary?.additions ?? diffData?.statSummary?.additions ?? 0}
                      </span>
                          <span className="flex items-center gap-1 text-xs font-mono text-red-400">
                        <Icon d={IC.minus} size={11} strokeWidth={2.5} />
                            {activeDiff.statSummary?.deletions ?? diffData?.statSummary?.deletions ?? 0}
                      </span>
                          {selectedHashes.size > 0 && (
                              <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-[#1f6feb22] text-[#58a6ff]' : 'bg-[#ddf4ff] text-[#0969da]'}`}>
                          commit view
                        </span>
                          )}
                        </div>
                      </div>

                      {/* Commits */}
                      {diffData?.commits?.length > 0 && (
                          <div className={`border-b ${isDark ? 'border-[#21262d]' : 'border-[#eaeef2]'}`}>
                            <button
                                onClick={() => setShowCommits(!showCommits)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer ${textDim} ${isDark ? 'hover:bg-[#1c2128]' : 'hover:bg-[#f6f8fa]'}`}
                            >
                              <span className="flex items-center gap-1.5"><Icon d={IC.commit} size={11} />Commits</span>
                              <Icon d={IC.chevron} size={11} strokeWidth={2} className={`transition-transform ${showCommits ? 'rotate-180' : ''}`} />
                            </button>
                            {showCommits && (
                                <CommitList
                                    commits={diffData.commits}
                                    selectedHashes={selectedHashes}
                                    onToggle={toggleCommit}
                                    onClearSelection={clearCommitSelection}
                                />
                            )}
                          </div>
                      )}

                      {/* Files */}
                      <div className="py-1">
                        <div className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest ${textDim}`}>
                          Changed files
                        </div>
                        <FileTree files={activeDiff.changedFiles} activeFile={activeFile} onSelect={scrollToFile} />
                      </div>
                    </div>
                  </aside>

                  <ResizeHandle onDrag={handleResize} />
                </>
            )}

            {/* ── Main ── */}
            <main className="flex-1 overflow-auto p-5">
              {/* Empty state */}
              {!activeDiff && !loading && !error && (
                  <div className="h-full flex flex-col items-center justify-center gap-4">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${bgSurface2} ${border}`}>
                      <Icon d={IC.git} size={28} className={textDim} />
                    </div>
                    <div className="text-center">
                      <div className={`text-sm mb-1 ${textMuted}`}>Select two branches and click Compare</div>
                      <div className={`text-xs ${textDim}`}>The diff will appear here</div>
                    </div>
                  </div>
              )}

              {/* Loader */}
              {loading && (
                  <div className={`flex items-center justify-center h-full gap-3 ${textMuted}`}>
                    <div className={`w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${isDark ? 'border-[#58a6ff]' : 'border-[#0969da]'}`} />
                    <span className="text-xs font-mono">Computing diff…</span>
                  </div>
              )}

              {/* Error */}
              {error && !loading && (
                  <div className="max-w-lg mx-auto mt-12 px-4 py-3 rounded-xl text-xs font-mono" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                    <strong>Error:</strong> {error}
                  </div>
              )}

              {/* Diff content */}
              {activeDiff && !loading && (
                  <>
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`text-xs font-mono flex items-center gap-2 ${textMuted}`}>
                        {selectedHashes.size > 0 ? (
                            <>
                        <span style={{ color: isDark ? '#bc8cff' : '#8250df' }}>
                          {selectedHashes.size} commit{selectedHashes.size > 1 ? 's' : ''}
                        </span>
                              <span className={textDim}>·</span>
                              <button onClick={clearCommitSelection} className={`hover:underline ${textDim}`}>show full diff</button>
                            </>
                        ) : (
                            <>
                              <span style={{ color: isDark ? '#58a6ff' : '#0969da' }}>{source}</span>
                              <span className={textDim}>into</span>
                              <span>{target}</span>
                            </>
                        )}
                      </div>
                      <div className={`flex gap-1 p-0.5 rounded-lg border ${surface} ${border}`}>
                        {[['unified', IC.file, 'Unified'], ['split', IC.split, 'Split']].map(([mode, icon, lbl]) => (
                            <button key={mode} onClick={() => setViewMode(mode)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-colors cursor-pointer ${
                                        viewMode === mode
                                            ? isDark ? 'bg-[#1c2128] text-[#e6edf3]' : 'bg-white text-[#1f2328] shadow-sm'
                                            : `${textDim}`
                                    }`}
                            >
                              <Icon d={icon} size={12} /> {lbl}
                            </button>
                        ))}
                      </div>
                    </div>

                    {/* No diff */}
                    {activeDiff.changedFiles.length === 0 && (
                        <div className={`text-center py-16 text-sm font-mono ${textMuted}`}>
                          No differences found
                        </div>
                    )}

                    {/* Files */}
                    {activeDiff.changedFiles.map(f => {
                      const collapsed = collapsedFiles.has(f.path);
                      const toggleCollapse = (e) => {
                        if (e.ctrlKey || e.metaKey) {
                          // Ctrl/Cmd + click: toggle all files
                          const allCollapsed = activeDiff.changedFiles.every(file => collapsedFiles.has(file.path));
                          setCollapsedFiles(allCollapsed ? new Set() : new Set(activeDiff.changedFiles.map(file => file.path)));
                        } else {
                          // Normal click: toggle this file
                          setCollapsedFiles(prev => {
                            const next = new Set(prev);
                            if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                            return next;
                          });
                        }
                      };
                      return (
                          <div key={f.path} ref={el => fileRefs.current[f.path] = el} className="mb-5 scroll-mt-4">
                            {/* File header — click to collapse/expand */}
                            <div
                                onClick={toggleCollapse}
                                className={`flex items-center gap-2.5 px-3 py-2 border-x border-t cursor-pointer select-none transition-colors ${
                                    collapsed ? `rounded-lg border-b ${isDark ? 'hover:bg-[#1c2128]' : 'hover:bg-[#ddf4ff]'}` : 'rounded-t-lg'
                                } ${isDark ? surface : 'bg-[#ddf4ff]'} ${border}`}
                            >
                              <Icon
                                  d={IC.chevron}
                                  size={13}
                                  className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''} ${textDim}`}
                                  strokeWidth={2}
                              />
                              <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[9px] font-bold ${statusCls(f.status, isDark)}`}>
                          {STATUS[f.status]?.letter || 'M'}
                        </span>
                              <span className="font-mono text-xs flex-1 truncate">{f.path}</span>
                              <span className={`text-[10px] font-mono capitalize ${statusCls(f.status, isDark).split(' ')[0]}`}>{f.status}</span>
                            </div>
                            {/* Diff body */}
                            {!collapsed && (
                                <div className={isDark ? 'dark' : 'light'}>
                                  {diffByFile[f.path]
                                      ? <FileDiff rawDiff={diffByFile[f.path]} viewMode={viewMode} isDark={isDark} />
                                      : <div className={`px-4 py-3 text-xs font-mono text-center rounded-b-lg border ${border} ${isDark ? 'bg-[#1f2630] text-[#7b838c]' : 'bg-white text-[#8c959f]'}`}>Binary file</div>
                                  }
                                </div>
                            )}
                          </div>
                      );
                    })}
                  </>
              )}
            </main>
          </div>
        </div>
      </ThemeCtx.Provider>
  );
}

// Floating theme toggle for home screen
function ThemeToggle() {
  const { isDark, setIsDark } = useTheme();
  return (
      <button
          onClick={() => setIsDark(!isDark)}
          className={`fixed top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${isDark ? 'bg-[#1f2630] border-[#30363d] text-[#7d8590] hover:text-[#e6edf3]' : 'bg-white border-[#d0d7de] text-[#656d76] hover:text-[#1f2328]'} cursor-pointer`}
      >
        <Icon d={isDark ? IC.sun : IC.moon} size={15} />
      </button>
  );
}