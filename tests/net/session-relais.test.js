// @vitest-environment node
/* ============================================================
   PROJET TITAN — LE CLIENT ET LE RELAIS, BRANCHÉS POUR DE VRAI
   ============================================================
   Les autres tests prennent le relais seul (requêtes à la main) ou le
   contrôleur seul (session simulée). Aucun ne branchait `session.js` sur un
   vrai relais : la boucle de relève, l'accusé de réception, le dédoublonnage
   et la diffusion en série n'étaient vérifiés nulle part ensemble
   (revue du 2026-09-14).

   Environnement Node et non jsdom : le `fetch` de Node refuse l'AbortSignal
   de jsdom, et la boucle tournerait à vide.
============================================================ */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { serveur, salles, compteursIp } from "../../server/relais.mjs";
import { creerSession, rejoindreSession } from "../../src/net/session.js";

let base = "";

beforeAll(async () => {
  await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

afterAll(async () => {
  // Les relèves en attente tiennent leur connexion jusqu'à 25 s : sans ça, la
  // fermeture du serveur attendait qu'elles expirent.
  serveur.closeAllConnections();
  await new Promise((ok) => serveur.close(ok));
});

beforeEach(() => {
  salles.clear();
  compteursIp.clear();
  delete process.env.CLE_RELAIS;
});

// La prochaine charge reçue sur un canal qui passe le filtre.
const prochain = (session, canal, filtre = () => true) => new Promise((ok) => {
  const stop = session.sur(canal, (charge) => {
    if (filtre(charge)) { stop(); ok(charge); }
  });
});

describe("Une table branchée pour de vrai", () => {
  it("main privée et intention arrivent une fois, et le plateau le plus récent gagne", async () => {
    const hote = await creerSession({ urlRelais: base, pseudo: "Hôte" });
    const invite = await rejoindreSession({
      urlRelais: base, id: hote.id, motDePasse: hote.motDePasse, pseudo: "Invité",
    });
    try {
      const mains = [];
      invite.sur("prive", (c) => mains.push(c));

      const mainRecue = prochain(invite, "prive");
      await hote.envoyerPrive(invite.ref, { main: ["tout_casser"] });
      expect(await mainRecue).toEqual({ main: ["tout_casser"] });

      const intentionRecue = prochain(hote, "intention");
      await invite.envoyerIntention("passerAuTitanSuivant", [], {});
      expect((await intentionRecue).fn).toBe("passerAuTitanSuivant");

      // Trois plateaux coup sur coup : le dernier doit être celui que la table voit.
      const dernier = prochain(invite, "etat", (e) => e.tour === 3);
      hote.diffuserEtat({ tour: 1 });
      hote.diffuserEtat({ tour: 2 });
      await hote.diffuserEtat({ tour: 3 });
      expect((await dernier).tour).toBe(3);

      // Redemander le plateau ne redonne pas le courrier déjà traité.
      const plateauRedonne = prochain(invite, "etat");
      invite.resynchroniser();
      await plateauRedonne;
      expect(mains).toHaveLength(1);
    } finally {
      await invite.quitter();
      await hote.quitter();
    }
  });
});
