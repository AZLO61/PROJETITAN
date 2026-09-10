# Scan anti-pattern de toutes les vues

`impeccable detect <url>` ne rend qu'une URL. Titan est une SPA : une seule
URL, l'état des vues est piloté par React. Ce document décrit comment couvrir
**toutes** les vues (partie 2D/3D, règles, tutoriel, distant, scoring,
journal) et pas seulement l'écran Réglages.

Méthode : on pilote l'app réelle dans un navigateur, on capture le HTML rendu
de chaque vue dans un fichier autonome (`index.css` sérialisé inline + lien
Google Fonts), puis on lance `impeccable detect` sur chaque fichier en
`file://` — ce qui déclenche le rendu navigateur complet du détecteur
(contraste, débordement, tailles calculées).

Les snapshots vont dans `.impeccable/scan/` (gitignoré, régénérable).

## Procédure

1. Démarrer le serveur de dev :
   ```
   npm run dev
   ```

2. Démarrer le puits d'écriture (un fichier par snapshot POSTé) :
   ```
   node scripts/scan-sink.mjs .impeccable/scan
   ```
   (écrit `.impeccable/scan/<name>.html` à chaque `POST /save?name=<name>`)

3. Dans la console du navigateur sur `http://localhost:5173/PROJETITAN/`,
   coller le helper :
   ```js
   window.__css = (function(){let c="";for(const s of document.styleSheets){try{for(const r of s.cssRules)c+=r.cssText+"\n";}catch(e){}}return c;})();
   window.__snap = function () {
     const b = document.body.cloneNode(true);
     b.querySelectorAll("script").forEach(s => s.remove());
     b.querySelectorAll("svg").forEach(s => { s.textContent = ""; });
     return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"UTF-8\">"
       + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
       + "<link href=\"https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400..800;1,400..700&family=Bowlby+One&family=Press+Start+2P&display=swap\" rel=\"stylesheet\">"
       + "<style>\n" + window.__css + "</style></head>\n" + b.outerHTML + "</html>";
   };
   window.__save = async (name) => (await fetch("http://localhost:9999/save?name=" + name, { method: "POST", body: window.__snap() })).text();
   ```

4. Naviguer chaque vue et appeler `await __save("<nom>")` :

   | Vue | Chemin de clics | nom |
   |---|---|---|
   | Réglages | (au chargement) | `01-setup` |
   | Tutoriel 1-7 | bouton « Première partie ? », puis « Suivant » | `02-tutoriel-N` |
   | Distant accueil | « Jouer à distance » | `03-distant-1-accueil` |
   | Distant ouvrir/rejoindre | « Ouvrir une table » / « Rejoindre une table » | `03-distant-2-ouvrir`, `03-distant-3-rejoindre` |
   | Partie 2D | nommer les 4 Titans, « Lancer la partie » | `04-jeu-2d` |
   | Scoring | bouton « Scoring » | `05-jeu-scoring` |
   | Journal | bouton « Journal » | `06-jeu-journal` |
   | Règles 1-8 | bouton « Règles », puis chaque entrée du sommaire | `07-regles-N` |
   | Partie 3D | bouton « Vue 3D » | `08-jeu-3d` |
   | Podium | fin de partie réelle — non couvert automatiquement | `09-podium` |

   Note : les vues en surimpression (tutoriel, règles) laissent la vue
   dessous montée dans le DOM. Un snapshot de `07-regles-*` contient donc
   aussi la partie en dessous : les alertes de `GameView` s'y répètent, ce
   n'est pas huit fois le même défaut.

5. Scanner tout le dossier, desktop puis mobile :
   ```
   BASE="file:///$(pwd | sed 's/ /%20/g')/.impeccable/scan"
   for f in .impeccable/scan/*.html; do
     echo "=== $(basename "$f") ==="
     impeccable detect "$BASE/$(basename "$f")"
   done
   impeccable detect --viewport 390x844 "$BASE/04-jeu-2d.html"   # etc.
   ```

## Podium

Le podium ne s'affiche qu'une fois `vm.classement` rempli (Verts révélés,
fin de partie). Pas de raccourci UI. Pour le scanner : jouer une partie
complète, ou rendre `PodiumFinal` isolé avec un `classement` de fixture.
Défaut déjà connu par lecture de `src/ui/panels/PodiumFinal.jsx` :
médailles en emoji (`🥇 🥈 🥉`, `🏆`) — contraire à DESIGN.md « Aucun émoji ».
