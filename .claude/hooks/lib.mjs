// Shared helpers for the project hooks. Plain Node, no dependencies.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const NEXT_APPS = ["kleelab-frontend", "kleelab-admin"];
export const BACKEND = "kleelab-backend";

// Git Bash hands Windows tools paths like /e/khalid/...; Node needs E:/khalid/...
export function toNativePath(p) {
  if (!p || process.platform !== "win32") return p;
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] ?? "/"}` : p;
}

if (process.env.CLAUDE_PROJECT_DIR) {
  process.env.CLAUDE_PROJECT_DIR = toNativePath(process.env.CLAUDE_PROJECT_DIR);
}

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// Walk up from a file to the app folder it belongs to, e.g. .../kleelab-admin.
// Works in the main checkout and in git worktrees.
export function findApp(file) {
  let dir = path.dirname(path.resolve(file));
  while (true) {
    const name = path.basename(dir);
    if (NEXT_APPS.includes(name) || name === BACKEND) return { name, root: dir };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// node_modules may only be installed in the main checkout, not in a worktree.
export function toolPath(appRoot, appName, rel) {
  const local = path.join(appRoot, "node_modules", rel);
  if (existsSync(local)) return local;
  const main = process.env.CLAUDE_PROJECT_DIR;
  if (main) {
    const shared = path.join(main, appName, "node_modules", rel);
    if (existsSync(shared)) return shared;
  }
  return null;
}

export function backendPython(appRoot) {
  const candidates = [
    path.join(appRoot, ".venv", "Scripts", "python.exe"),
    path.join(appRoot, ".venv", "bin", "python"),
  ];
  const main = process.env.CLAUDE_PROJECT_DIR;
  if (main) {
    candidates.push(path.join(main, BACKEND, ".venv", "Scripts", "python.exe"));
    candidates.push(path.join(main, BACKEND, ".venv", "bin", "python"));
  }
  return candidates.find((p) => existsSync(p)) ?? "python";
}

export function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 170_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// Exit code 2 sends stderr back to Claude so the agent fixes it.
export function fail(message) {
  process.stderr.write(message.slice(0, 6000) + "\n");
  process.exit(2);
}
