// After every Edit/Write: lint the edited TypeScript file, or compile the edited
// Python file. Fast, one file at a time. See docs/engineering/agents.md.
import { existsSync } from "node:fs";
import path from "node:path";
import { readInput, findApp, toolPath, backendPython, run, fail, toNativePath, NEXT_APPS } from "./lib.mjs";

const input = readInput();
const file = toNativePath(input.tool_input?.file_path ?? input.tool_input?.notebook_path);
if (!file || !existsSync(file)) process.exit(0);

const normalized = file.replaceAll("\\", "/");
if (/\/(node_modules|\.next|\.venv|__pycache__)\//.test(normalized)) process.exit(0);

const app = findApp(file);
if (!app) process.exit(0);
const ext = path.extname(file).toLowerCase();

if (NEXT_APPS.includes(app.name) && [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
  const eslint = toolPath(app.root, app.name, "eslint/bin/eslint.js");
  if (!eslint) process.exit(0);
  const r = run(process.execPath, [eslint, "--no-warn-ignored", path.resolve(file)], app.root);
  if (!r.ok) fail(`ESLint found problems in ${path.relative(app.root, file)}:\n${r.out}`);
}

if (app.name === "kleelab-backend" && ext === ".py") {
  const r = run(backendPython(app.root), ["-m", "py_compile", path.resolve(file)], app.root);
  if (!r.ok) fail(`Python could not compile ${path.relative(app.root, file)}:\n${r.out}`);
}

process.exit(0);
