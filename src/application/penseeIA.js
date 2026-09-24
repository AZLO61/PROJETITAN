/* ============================================================
   PROJET TITAN — La réflexion des IA, hors du fil de l'interface
   ============================================================
   Nikola, 2026-09-16, sur l'audit du 14 : « on la passe dans un Web Worker,
   si ça améliore l'expérience ».

   Elle l'améliore. Un tour d'Expert (`planTour`) simule tous ses coups avec
   les vrais résolveurs : une demi-seconde au 95e centile sur PC, jusqu'à
   1,6 s, et quatre à six fois plus sur un téléphone. Sur le fil principal,
   plus rien ne bouge pendant ce temps : ni les traînées, ni les boutons, ni —
   chez l'hôte d'une partie à distance — la file des intentions et les
   accusés de réception de toute la table.

   Deux chemins, un seul résultat :
   · navigateur : la recherche part dans `iaWorker.js`, et `suite` est
     rappelée à son retour ;
   · pas de Worker (tests sous jsdom, Worker qui ne se charge pas) : elle
     tourne ici, et `suite` est rappelée TOUT DE SUITE, dans le même appel —
     le comportement synchrone d'avant, à l'identique.

   Les deux tirent d'un générateur semé par la MÊME graine (`avecGraine`),
   prise dans le flux de la partie au moment de la demande : une graine de
   partie rejoue la même IA quel que soit le chemin.

   Un rappel et non une promesse : une promesse se résout toujours dans une
   micro-tâche, même quand la valeur est déjà là. Le repli n'aurait alors plus
   été synchrone, et les tests qui avancent l'horloge à la main auraient vu
   l'IA manquer leurs ticks. */
import * as planificateurs from "../domain/aiPlanner.js";
import { avecGraine, randomInt } from "../domain/rng.js";

const calculer = ({ nom, args, graine }) => avecGraine(graine, () => planificateurs[nom](...args));

let travailleur; // `undefined` : jamais essayé ; `null` : indisponible
const enAttente = new Map();
let prochainId = 0;

/* Un Worker qui ne se charge pas (fichier introuvable, politique de sécurité)
   ne doit pas figer la partie : ce qui l'attendait est calculé ici, et les
   demandes suivantes aussi. */
function renoncer() {
  travailleur = null;
  const demandes = [...enAttente.values()];
  enAttente.clear();
  // Une demande qui lève ne doit pas emporter celles qui attendent derrière.
  demandes.forEach((d) => {
    try { d.suite(calculer(d)); } catch (e) { console.error("[penseeIA]", d.nom, e); }
  });
}

function obtenirTravailleur() {
  if (travailleur !== undefined) return travailleur;
  travailleur = null;
  if (typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./iaWorker.js", import.meta.url), { type: "module" });
    w.onmessage = ({ data }) => {
      const d = enAttente.get(data.id);
      if (!d) return;
      enAttente.delete(data.id);
      // Une recherche qui a levé là-bas est rejouée ici : l'erreur remonte
      // alors comme avant, au lieu de se perdre dans un autre fil.
      d.suite("erreur" in data ? calculer(d) : data.resultat);
    };
    w.onerror = () => { w.terminate(); renoncer(); };
    // Une réponse impossible à désérialiser ne doit pas rester sans suite.
    w.onmessageerror = () => { w.terminate(); renoncer(); };
    travailleur = w;
  } catch {
    travailleur = null;
  }
  return travailleur;
}

/** Lance le planificateur `nom` (un export de `aiPlanner.js`) sur `args`, puis
 *  rappelle `suite(resultat)` — tout de suite si aucun Worker n'est là. */
export function penser(nom, args, suite) {
  const demande = { nom, args, graine: randomInt(0x100000000), suite };
  const w = obtenirTravailleur();
  if (w) {
    const id = ++prochainId;
    enAttente.set(id, demande);
    try {
      w.postMessage({ id, nom, args, graine: demande.graine });
      return;
    } catch {
      // Donnée intransmissible : calculée ici, comme sans Worker.
      enAttente.delete(id);
    }
  }
  suite(calculer(demande));
}
