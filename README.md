<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
  <img src="./images/icon.png" height="50" alt="banner">
  <h1 style="margin: 0; border: none; text-decoration: none;">GitReview</h1>
</div>

A VS Code extension for reviewing git diffs between branches and commits.

## Features

- **Branch Comparison**: Compare any two branches to see the differences
- **Commit Selection**: Select specific commits and view their individual diffs
- **File Changes**: View a list of changed files with their modification status
- **Statistics**: See total lines added and deleted across branches or commits
- **Syntax Highlighting**: Diffs are displayed with proper syntax highlighting using diff2html
- **Remote Status**: Check if your remote is reachable and fetch the latest branches
- **Dark Mode**: Toggle between light and dark themes

## Getting Started

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run the **GitReview** command
3. Enter the path to a git repository
4. Select two branches to compare or individual commits to review
5. Click **Compare** to view the diff

## How It Works

- **BASE**: The target branch (the original code)
- **COMPARE**: The source branch (the new code you're reviewing)
- The diff shows all changes from BASE to COMPARE
- Select commits in the sidebar to see their individual diffs
- Changed files are listed with their modification status (M, A, D, R, etc.)

## Requirements

- A git repository on your local machine
- Git installed and available in your PATH

## Installation from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (comes with Node.js)
- VS Code

### Build and Package

1. **Clone or download the repository**
   ```bash
   git clone <repository-url>
   cd GitReviewVSCodeExtension
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd webview-ui && npm install && cd ..
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Create a .vsix package**
   ```bash
   npx vsce package
   ```
   This will create a `gitreview-0.0.1.vsix` file in the project directory.

5. **Install the extension locally**
   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`)
   - Click the **...** menu at the top of the Extensions panel
   - Select **Install from VSIX...**
   - Navigate to and select the `.vsix` file you just created

Alternatively, you can use the command line:
```bash
code --install-extension gitreview-0.0.1.vsix
```

### Development Mode

For development with hot reload:

1. **Terminal 1 - Watch UI changes:**
   ```bash
   cd webview-ui && npm run dev
   ```

2. **Terminal 2 - Watch extension changes:**
   ```bash
   npm run watch
   ```

3. **VS Code - Press `F5`** to start debugging the extension in a new VS Code window

## Known Issues

None at this time.

## Release Notes

### 1.0.0

Initial release of GitReview extension.

---

**Enjoy reviewing your code!**
