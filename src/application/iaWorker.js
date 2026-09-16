/* Le fil de réflexion des IA. Son seul client est `penseeIA.js`, qui en
   explique la raison d'être. Il ne voit aucune partie : il reçoit une copie de
   l'état, cherche, et renvoie le coup. La graine arrive avec la demande, pour
   que la recherche soit la même que sur le fil principal. */
import * as planificateurs from "../domain/aiPlanner.js";
import { avecGraine } from "../domain/rng.js";

self.onmessage = ({ data: { id, nom, args, graine } }) => {
  try {
    self.postMessage({ id, resultat: avecGraine(graine, () => planificateurs[nom](...args)) });
  } catch (e) {
    self.postMessage({ id, erreur: String(e?.message || e) });
  }
};
