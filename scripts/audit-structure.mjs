import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(".");
const required = [
  "package.json", "index.html", "vite.config.js", "src/main.jsx",
  "src/domain/index.js", "src/application/useBoardGeneratorController.jsx",
  "src/ui/GameView.jsx", "src/ai/state.js", "src/ai/actions.js",
  "schemas/ai-state.schema.json", "schemas/ai-command.schema.json",
  ".github/workflows/ci.yml", "docs/ai/QUICK_CONTEXT.md"
];

let failed = false;
for (const file of required) {
  try { await stat(join(root, file)); }
  catch { console.error(`Missing required file: ${file}`); failed = true; }
}

const sourceRoots = ["src/domain", "src/application", "src/ai", "src/ui"];
let files = 0;
let bytes = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(js|jsx)$/.test(entry.name)) {
      files++;
      const text = await readFile(path, "utf8");
      bytes += Buffer.byteLength(text);
      const rel = relative(root, path).replaceAll("\\", "/");

      if (/data:image\/(png|jpeg|webp);base64,/i.test(text)) {
        console.error(`Embedded base64 image found in source: ${rel}`);
        failed = true;
      }
      if (rel.startsWith("src/domain/") && /from\s+["'](?:react|three|react-dom)/.test(text)) {
        console.error(`Domain imports UI/runtime library: ${rel}`);
        failed = true;
      }
    }
  }
}
for (const rootDir of sourceRoots) await walk(join(root, rootDir));

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (const script of ["dev", "build", "test", "lint", "audit", "check"]) {
  if (!pkg.scripts?.[script]) {
    console.error(`Missing npm script: ${script}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Repository audit OK: ${files} JS/JSX modules, ${bytes} source bytes.`);
