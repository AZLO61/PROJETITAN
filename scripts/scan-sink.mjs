// Puits d'écriture pour le scan anti-pattern des vues (voir docs/scan-vues.md).
//
// La page de dev POSTe le HTML rendu d'une vue ici ; ce serveur l'écrit dans
// un fichier. Uniquement pour le développement local : il accepte tout corps
// de requête tel quel et n'écrit que dans le dossier passé en argument.
//
//   node scripts/scan-sink.mjs .impeccable/scan
//
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const DIR = process.argv[2] || ".impeccable/scan";
mkdirSync(DIR, { recursive: true });

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.end();

    const raw = new URL(req.url, "http://x").searchParams.get("name") || "snap";
    const name = basename(raw).replace(/[^a-z0-9._-]/gi, "_");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const file = join(DIR, `${name}.html`);
      writeFileSync(file, body);
      console.log(`wrote ${file} (${body.length} bytes)`);
      res.end("ok");
    });
  })
  .listen(9999, () => console.log(`scan-sink sur :9999 -> ${DIR}`));
