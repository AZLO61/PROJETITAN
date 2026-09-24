/* ============================================================
   PROJET TITAN — Garde-fou du code mort (2026-09-24)
   ============================================================
   ESLint voit une variable morte DANS un fichier. Il ne voit pas ce qui meurt
   ENTRE les fichiers : un export que plus rien n'importe, un module que plus
   rien n'atteint, un champ du viewmodel que l'interface ne lit plus. C'est là
   que se cachait le gros du code mort de la 40e passe — cinq façades et un
   échafaudage entiers, 55 champs du viewmodel, et derrière eux des états
   écrits mais jamais lus. Ce script fait échouer `npm run check` sur ces cas.

   Un export n'est vivant que si un AUTRE fichier l'importe (tests et scripts
   compris). Un export lu seulement dans son fichier n'a pas à être exporté.
   Un champ du viewmodel est vivant s'il est lu par l'interface, par un test,
   ou joué à distance (ACTIONS_DISTANTES).
============================================================ */
import fs from "node:fs";
import path from "node:path";
// espree est l'analyseur d'ESLint : installé avec lui, aucune dépendance de plus.
import * as espree from "espree";

const ROOT = path.resolve(process.argv[2] || ".");
const lister = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return /[\\/](node_modules|tmp)$/.test(p) ? [] : lister(p);
  return /\.(js|jsx|mjs)$/.test(e.name) ? [p] : [];
});
const fichiers = ["src", "server", "scripts", "tests"].flatMap((d) => lister(path.join(ROOT, d)));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
const analyser = (f) => espree.parse(fs.readFileSync(f, "utf8"), {
  ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true,
});
function parcourir(n, cb, parent) {
  if (!n || typeof n.type !== "string") return;
  cb(n, parent);
  for (const k in n) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => parcourir(c, cb, n));
    else if (v && typeof v.type === "string") parcourir(v, cb, n);
  }
}
const resoudre = (depuis, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(depuis), spec);
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, "index.js")]
    .find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
};

/* ── Exports, imports, et noms lus dans chaque fichier ── */
const infos = new Map();
for (const f of fichiers) {
  const I = { exports: new Map(), imports: [], lus: new Set(), relaie: [], espaces: new Map() };
  infos.set(f, I);
  const importer = (spec, noms) => { const cible = resoudre(f, spec); if (cible) I.imports.push({ cible, noms }); };
  const ast = analyser(f);
  const declarations = new Set();
  for (const st of ast.body) {
    if (st.type === "ImportDeclaration") {
      const noms = new Set();
      for (const s of st.specifiers) {
        if (s.type === "ImportSpecifier") noms.add(s.imported.name);
        else if (s.type === "ImportDefaultSpecifier") noms.add("default");
        else I.espaces.set(s.local.name, st.source.value);
      }
      importer(st.source.value, noms);
    } else if (st.type === "ExportNamedDeclaration") {
      if (st.source) {
        importer(st.source.value, new Set(st.specifiers.map((s) => s.local.name)));
        for (const s of st.specifiers) I.exports.set(s.exported.name, st.range[0]);
      } else if (st.declaration?.id) {
        I.exports.set(st.declaration.id.name, st.range[0]);
        declarations.add(st.declaration.id.range[0]);
      } else if (st.declaration) {
        for (const d of st.declaration.declarations) {
          parcourir(d.id, (n) => { if (n.type === "Identifier") { I.exports.set(n.name, st.range[0]); declarations.add(n.range[0]); } });
        }
      } else for (const s of st.specifiers) I.exports.set(s.exported.name, st.range[0]);
    } else if (st.type === "ExportDefaultDeclaration") I.exports.set("default", st.range[0]);
    else if (st.type === "ExportAllDeclaration") {
      const cible = resoudre(f, st.source.value);
      if (cible) { I.relaie.push(cible); I.imports.push({ cible, noms: new Set() }); }
    }
  }
  parcourir(ast, (n, p) => {
    // import() dynamique et new URL("./x.js") (Web Worker) : tout le module compte.
    const lien = n.type === "ImportExpression" ? n.source
      : n.type === "NewExpression" && n.callee.name === "URL" ? n.arguments[0] : null;
    if (lien?.type === "Literal") importer(lien.value, "*");
    // const { a, b } = EspaceDeNoms
    if (n.type === "VariableDeclarator" && n.init?.type === "Identifier" && I.espaces.has(n.init.name) && n.id.type === "ObjectPattern")
      importer(I.espaces.get(n.init.name), new Set(n.id.properties.map((q) => q.key?.name).filter(Boolean)));
    // EspaceDeNoms.a
    if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && I.espaces.has(n.object.name))
      importer(I.espaces.get(n.object.name), new Set([n.property.name]));
    if (n.type !== "Identifier" && n.type !== "JSXIdentifier") return;
    if (declarations.has(n.range[0])) return;
    if (p?.type === "MemberExpression" && p.property === n && !p.computed) return;
    if (/^(Property|MethodDefinition|PropertyDefinition)$/.test(p?.type) && p.key === n && !p.computed && !p.shorthand) return;
    if (/^(Import|Export)/.test(p?.type ?? "")) return;
    I.lus.add(n.name);
  });
}

const problemes = [];

/* ── Modules que le jeu n'atteint pas ── */
const atteints = new Set();
for (const pile = [path.join(ROOT, "src/main.jsx")]; pile.length;) {
  const f = pile.pop();
  if (atteints.has(f) || !infos.has(f)) continue;
  atteints.add(f);
  for (const im of infos.get(f).imports) pile.push(im.cible);
}
for (const f of fichiers) if (rel(f).startsWith("src/") && !atteints.has(f)) problemes.push(`module jamais atteint par le jeu : ${rel(f)}`);

/* ── Exports sans importeur ── */
const importes = new Set();
const marquer = (cible, nom, vus = new Set()) => {
  const cle = `${cible}::${nom}`;
  if (vus.has(cle)) return;
  vus.add(cle);
  importes.add(cle);
  for (const r of infos.get(cible)?.relaie ?? []) marquer(r, nom, vus);
};
for (const I of infos.values()) {
  for (const { cible, noms } of I.imports) {
    const T = infos.get(cible);
    if (!T) continue;
    for (const nom of noms === "*" ? T.exports.keys() : noms) marquer(cible, nom);
  }
}
for (const [f, I] of infos) {
  if (rel(f).startsWith("tests/")) continue;
  for (const nom of I.exports.keys()) {
    if (importes.has(`${f}::${nom}`)) continue;
    problemes.push(I.lus.has(nom)
      ? `export inutile (lu seulement dans son fichier) : ${rel(f)} → ${nom}`
      : `export mort : ${rel(f)} → ${nom}`);
  }
}

/* ── Champs du viewmodel lus par personne ──
   Interface : `vm.x`, `props.x`, ou `const { x } = vm`. Tests : tout accès `.x`
   ou `{ x }`, leurs harnais nommant le viewmodel de mille façons. */
const CTRL = path.join(ROOT, "src/application/useBoardGeneratorController.jsx");
const champs = new Set(), distantes = new Set();
parcourir(analyser(CTRL), (n) => {
  if (n.type === "VariableDeclarator" && n.id.name === "vm" && n.init?.type === "ObjectExpression")
    for (const p of n.init.properties) if (p.key) champs.add(p.key.name);
  if (n.type === "VariableDeclarator" && n.id.name === "ACTIONS_DISTANTES")
    parcourir(n.init, (m) => { if (m.type === "Property" && m.key?.type === "Identifier") distantes.add(m.key.name); });
});
const lus = new Set();
for (const f of fichiers.filter((x) => /^(src\/ui\/|src\/BoardGenerator|tests\/)/.test(rel(x)))) {
  const test = rel(f).startsWith("tests/");
  parcourir(analyser(f), (n) => {
    if (n.type === "MemberExpression" && !n.computed && (test || ["vm", "props"].includes(n.object.name))) lus.add(n.property.name);
    if (test && n.type === "ObjectPattern") for (const p of n.properties) if (p.key) lus.add(p.key.name);
    if (!test && n.type === "VariableDeclarator" && ["vm", "props"].includes(n.init?.name) && n.id.type === "ObjectPattern")
      for (const p of n.id.properties) if (p.key) lus.add(p.key.name);
  });
}
for (const c of champs) if (!lus.has(c) && !distantes.has(c)) problemes.push(`champ du viewmodel lu par personne : ${c}`);

if (problemes.length > 0) {
  console.error(`Code mort (${problemes.length}) :\n  ${problemes.join("\n  ")}`);
  process.exit(1);
}
console.log(`Code mort : aucun (${fichiers.length} fichiers, ${champs.size} champs du viewmodel).`);
