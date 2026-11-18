// Before a session or agent finishes: type-check each Next.js app that has
// uncommitted TypeScript changes. Blocks finishing once if it fails.
import path from "node:path";
import { readInput, toolPath, run, fail, toNativePath, NEXT_APPS } from "./lib.mjs";

const input = readInput();
// Already blocked once this turn: let it finish rather than loop.
if (input.stop_hook_active) process.exit(0);

const cwd = toNativePath(input.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const top = run("git", ["rev-parse", "--show-toplevel"], cwd);
if (!top.ok) process.exit(0);
const repo = top.out.split("\n")[0].trim();

const status = run("git", ["status", "--porcelain", "--untracked-files=all"], repo);
if (!status.ok) process.exit(0);

const changed = new Set();
for (const line of status.out.split("\n")) {
  const file = line.slice(3).trim().replace(/^"|"$/g, "");
  const app = NEXT_APPS.find((a) => file.startsWith(`${a}/`));
  if (app && /\.(ts|tsx)$/.test(file)) changed.add(app);
}

const failures = [];
for (const app of changed) {
  const root = path.join(repo, app);
  const tsc = toolPath(root, app, "typescript/bin/tsc");
  if (!tsc) continue;
  const r = run(process.execPath, [tsc, "--noEmit", "-p", root], root);
  if (!r.ok) failures.push(`${app}: tsc --noEmit failed\n${r.out}`);
}

if (failures.length) fail(`Type check failed. Fix these before finishing:\n\n${failures.join("\n\n")}`);
process.exit(0);
