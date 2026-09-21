/* PARTIES SIMULÉES, RÉPARTIES SUR LES CŒURS DE LA MACHINE.
 * ==========================================================
 * Une partie d'Experts prend ~7 s sur un cœur : les campagnes de mesure
 * (`duel-reglages.mjs`, `mesure-forces.mjs`) tenaient une heure et plus.
 * `jouerParties` les distribue sur des fils (`node:worker_threads`) et rend
 * les comptes rendus DANS L'ORDRE des tâches.
 *
 * Le résultat ne dépend pas du nombre de fils : chaque partie remet le
 * générateur à sa propre graine (`jouerPartie`), et rien d'autre ne passe
 * d'une partie à l'autre. Vérifié le 2026-09-21 contre l'ancienne boucle
 * séquentielle du duel, série par série.
 *
 * `FILS=4` en réserve quand la machine sert à autre chose : une campagne
 * lancée pendant `npm test` fait sauter les tests longs en délai dépassé.
 *
 * Ce fichier est aussi le code des fils : lancé comme fil, il joue les
 * parties qu'on lui envoie.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { jouerPartie } from "../src/domain/simulation.js";

if (!isMainThread) {
  parentPort.on("message", ({ i, options }) => {
    parentPort.postMessage({ i, resultat: jouerPartie(options) });
  });
}

/**
 * @param {object[]} taches  options de `jouerPartie`, une par partie
 * @returns {Promise<object[]>} les comptes rendus, dans l'ordre des tâches
 */
export function jouerParties(taches) {
  const fils = Math.min(taches.length, Number(process.env.FILS) || Math.max(1, availableParallelism() - 1));
  const resultats = new Array(taches.length);
  let prochaine = 0, rendues = 0;
  return new Promise((fini, echec) => {
    if (taches.length === 0) { fini(resultats); return; }
    const donner = (w) => {
      if (prochaine < taches.length) { w.postMessage({ i: prochaine, options: taches[prochaine] }); prochaine++; }
      else w.terminate();
    };
    for (let f = 0; f < fils; f++) {
      const w = new Worker(new URL(import.meta.url));
      w.on("error", echec);
      w.on("message", ({ i, resultat }) => {
        resultats[i] = resultat;
        rendues++;
        process.stderr.write(`\r${rendues}/${taches.length} parties`);
        if (rendues === taches.length) { process.stderr.write("\n"); fini(resultats); }
        donner(w);
      });
      donner(w);
    }
  });
}
