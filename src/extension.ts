import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

function git(repoPath: string, command: string): string {
  try {
    return execSync(`git -C "${repoPath}" ${command}`, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch (err: any) {
    throw new Error(err.stderr || err.message || "Git command failed");
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.open", () => {
      const panel = vscode.window.createWebviewPanel(
        "gitreviewapp",
        "GitReview",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "webview-ui", "dist")
          ]
        }
      );

      panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage((message) => {
        // Handle webview-ready message to send workspace path
        if (message.type === "webview-ready") {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const workspacePath = workspaceFolders?.[0]?.uri.fsPath || null;
          panel.webview.postMessage({
            type: "workspace-path",
            path: workspacePath,
          });
          return;
        }

        // Handle git commands
        try {
          let response: any = {};

          switch (message.command) {
            case "repo-info":
              response = getRepoInfo(message.data.path);
              break;
            case "fetch-remote":
              response = fetchRemote(message.data.path);
              break;
            case "diff":
              response = getDiff(
                message.data.path,
                message.data.source,
                message.data.target
              );
              break;
            case "commit-diff":
              response = getCommitDiff(message.data.path, message.data.hashes);
              break;
            default:
              throw new Error(`Unknown command: ${message.command}`);
          }

          panel.webview.postMessage({
            type: "response",
            id: message.id,
            data: response,
          });
        } catch (error: any) {
          panel.webview.postMessage({
            type: "response",
            id: message.id,
            error: error.message || "An error occurred",
          });
        }
      });
    })
  );
}

function getRepoInfo(repoPath: string): any {
  try {
    // Get all branches (local and remote)
    const branchOutput = git(repoPath, "branch -a");
    const branches = branchOutput
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith("*"))
      .map((line: string) => line.replace(/^[\s*]+/, "")) // Remove leading spaces/asterisks
      .map((line: string) => line.replace(/^remotes\//, "")); // Convert "remotes/origin/..." to "origin/..."

    // Extract repo name from path
    const repoName = path.basename(repoPath);

    return {
      branches,
      currentBranch: "",
      repoName,
    };
  } catch (err: any) {
    throw new Error(
      `Failed to get repo info: ${err.message || "Unknown error"}`
    );
  }
}

function fetchRemote(repoPath: string): any {
  try {
    // Check if remote is reachable by listing remote branches
    let reachable = false;
    let branches: string[] = [];

    try {
      const output = git(repoPath, "ls-remote --heads origin");
      reachable = true;
      branches = output
        .split("\n")
        .filter((line: string) => line.trim())
        .map((line: string) => {
          const match = line.match(/refs\/heads\/(.+)$/);
          return match ? `origin/${match[1]}` : "";
        })
        .filter((branch: string) => branch.length > 0);
    } catch {
      // Remote not reachable
      reachable = false;
    }

    return { reachable, branches };
  } catch (err: any) {
    throw new Error(
      `Failed to fetch remote: ${err.message || "Unknown error"}`
    );
  }
}

function getDiff(
  repoPath: string,
  source: string,
  target: string
): any {
  try {
    // Get the unified diff using three-dot syntax (merge-base)
    const diffOutput = git(repoPath, `diff "${target}"..."${source}" --unified=4 --no-color`);

    // Get the list of changed files
    const filesOutput = git(repoPath, `diff "${target}"..."${source}" --name-status`);

    const changedFiles = filesOutput
      .split("\n")
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const parts = line.split("\t");
        const status = parts[0];
        const filePath = parts.slice(1).join("\t");
        return {
          path: filePath,
          status: status.startsWith("A")
            ? "added"
            : status.startsWith("D")
            ? "deleted"
            : status.startsWith("R")
            ? "renamed"
            : "modified"
        };
      });

    // Get the list of commits
    const logsOutput = git(repoPath, `log "${target}".."${source}" --oneline --no-color`);

    const commits = logsOutput
      .split("\n")
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const idx = line.indexOf(" ");
        return {
          hash: line.substring(0, idx),
          message: line.substring(idx + 1),
        };
      });

    // Get diff statistics
    let additions = 0;
    let deletions = 0;
    try {
      const statOutput = git(repoPath, `diff "${target}"..."${source}" --shortstat`);
      const addMatch = statOutput.match(/(\d+) insertion/);
      const delMatch = statOutput.match(/(\d+) deletion/);
      if (addMatch) additions = parseInt(addMatch[1]);
      if (delMatch) deletions = parseInt(delMatch[1]);
    } catch {
      // If shortstat fails, continue without stats
    }

    return {
      commits,
      changedFiles,
      diff: diffOutput,
      statSummary: {
        additions,
        deletions,
      },
    };
  } catch (err: any) {
    throw new Error(`Failed to get diff: ${err.message || "Unknown error"}`);
  }
}

function getCommitDiff(
  repoPath: string,
  hashes: string[]
): any {
  try {
    let diffRaw = "";
    const changedFilesMap: { [key: string]: string } = {};
    let additions = 0;
    let deletions = 0;

    // For single commit
    if (hashes.length === 1) {
      const hash = hashes[0];
      try {
        // Get the commit diff
        diffRaw = git(repoPath, `show "${hash}" --unified=4 --no-color --format=`).trimStart();

        // Get changed files using diff-tree
        const treeOutput = git(repoPath, `diff-tree --no-commit-id -r --name-status "${hash}"`);

        treeOutput
          .split("\n")
          .filter((line: string) => line.trim())
          .forEach((line: string) => {
            const parts = line.split("\t");
            const status = parts[0];
            const filePath = parts.slice(1).join("\t");
            changedFilesMap[filePath] = status.startsWith("A")
              ? "added"
              : status.startsWith("D")
              ? "deleted"
              : status.startsWith("R")
              ? "renamed"
              : "modified";
          });
      } catch (err) {
        throw err;
      }
    } else {
      // For multiple commits: diff from parent of oldest to newest
      const oldest = hashes[hashes.length - 1];
      const newest = hashes[0];

      try {
        // Get the diff
        diffRaw = git(repoPath, `diff "${oldest}^".."${newest}" --unified=4 --no-color`);

        // Get changed files
        const filesOutput = git(repoPath, `diff "${oldest}^".."${newest}" --name-status`);

        filesOutput
          .split("\n")
          .filter((line: string) => line.trim())
          .forEach((line: string) => {
            const parts = line.split("\t");
            const status = parts[0];
            const filePath = parts.slice(1).join("\t");
            changedFilesMap[filePath] = status.startsWith("A")
              ? "added"
              : status.startsWith("D")
              ? "deleted"
              : status.startsWith("R")
              ? "renamed"
              : "modified";
          });
      } catch (err) {
        throw err;
      }
    }

    // Try to get stats summary
    try {
      const statOutput = git(repoPath, `diff "${hashes[hashes.length - 1]}^".."${hashes[0]}" --shortstat`);
      const addMatch = statOutput.match(/(\d+) insertion/);
      const delMatch = statOutput.match(/(\d+) deletion/);
      if (addMatch) additions = parseInt(addMatch[1]);
      if (delMatch) deletions = parseInt(delMatch[1]);
    } catch {
      // If shortstat fails, continue without stats
    }

    const changedFiles = Object.entries(changedFilesMap).map(([path, status]) => ({
      path,
      status,
    }));

    return {
      changedFiles,
      diff: diffRaw,
      statSummary: {
        additions,
        deletions,
      },
    };
  } catch (err: any) {
    throw new Error(
      `Failed to get commit diff: ${err.message || "Unknown error"}`
    );
  }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const distPath = vscode.Uri.joinPath(extensionUri, "webview-ui", "dist");
  const indexPath = path.join(distPath.fsPath, "index.html");

  let html = fs.readFileSync(indexPath, "utf8");

  // Rewrite asset paths to use webview URIs
  const distUri = webview.asWebviewUri(distPath).toString();
  html = html.replace(/(src|href)="\/([^"]*)"/g, `$1="${distUri}/$2"`);
  html = html.replace(/(src|href)="\.\/([^"]*)"/g, `$1="${distUri}/$2"`);

  return html;
}

export function deactivate() {}