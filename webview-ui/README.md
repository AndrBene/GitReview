# gitreview — Local PR Viewer

A GitHub-style pull request diff viewer for on-premise / local git repos.
Runs entirely on localhost. Single terminal, single `npm run dev`.

## Requirements

- Node.js 16+
- npm

## Setup & Run

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

## Usage

1. Enter the absolute path to a local git repo (e.g. `/home/user/projects/myapp`)
2. Select a **base** branch (e.g. `origin/main`) and a **compare** branch (e.g. `origin/feature-x`)
3. Click **Compare**
4. Browse the diff — click files in the sidebar to jump, toggle Unified / Split view

> **Note:** Only remote branches are listed. Make sure your repo is up to date with `git fetch --all` before comparing.

## How it works

The API (git commands) runs as a Vite dev server plugin — no separate backend process needed.
The frontend is React + diff2html for the diff rendering.
