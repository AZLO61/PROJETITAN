/* ============================================================
   PROJET TITAN — LE COURRIER ARRIVE, MÊME QUAND UNE RÉPONSE SE PERD
   ============================================================
   Revue du 2026-09-14. La file d'un participant était vidée au moment où la
   réponse partait : une réponse perdue en route emportait pour de bon les
   intentions, le courrier privé et les départs. Le client accuse désormais
   réception (`recu`), et le relais garde ce qui n'est pas accusé.

   Et un seul acteur ne verrouille plus une table en prenant toutes les
   places : quatre au plus par adresse, boucle locale exceptée.
============================================================ */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { serveur, salles, compteursIp, creerSalle, rejoindreSalle } from "../../server/relais.mjs";

let base = "";

beforeAll(async () => {
  await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

afterAll(async () => {
  await new Promise((ok) => serveur.close(ok));
});

beforeEach(() => {
  salles.clear();
  compteursIp.clear();
  delete process.env.CLE_RELAIS;
});

const poster = (route, corps) => fetch(`${base}${route}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corps),
}).then((r) => r.json());

async function tableAvecInvite() {
  const hote = await poster("/api/creer", { pseudo: "Hôte" });
  const invite = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Invité" });
  return { hote, invite };
}

// `versionEtat` très haut : on ne veut que la file de messages, pas l'état.
const relever = (p, recu) => fetch(
  `${base}/api/flux?id=${p.id}&versionEtat=999${recu === undefined ? "" : `&recu=${recu}`}`,
  { headers: { "X-Jeton": p.jeton } }
).then((r) => r.json());

const envoyer = (p, message) => poster("/api/envoyer", { id: p.id, jeton: p.jeton, message });

describe("Le courrier survit à une réponse perdue", () => {
  it("un message non accusé est redonné à la relève suivante, puis plus jamais", async () => {
    const { hote, invite } = await tableAvecInvite();
    await envoyer(hote, { t: "prive", vers: invite.ref, charge: { main: ["tout_casser"] } });

    const premiere = await relever(invite, 0);
    const prive = premiere.messages.find((m) => m.t === "prive");
    expect(prive).toBeTruthy();
    expect(typeof prive.n).toBe("number");

    // La réponse s'est perdue : le client relève sans avoir rien accusé.
    const seconde = await relever(invite, 0);
    expect(seconde.messages.some((m) => m.t === "prive" && m.n === prive.n)).toBe(true);

    // Il accuse tout ce qu'il a reçu. Un nouveau message part pour que la
    // relève réponde tout de suite au lieu d'attendre 25 s.
    const dernier = Math.max(...seconde.messages.map((m) => m.n));
    await envoyer(hote, { t: "chat", texte: "suite" });
    const troisieme = await relever(invite, dernier);
    expect(troisieme.messages.some((m) => m.t === "prive")).toBe(false);
    expect(troisieme.messages.some((m) => m.t === "chat")).toBe(true);
  });

  it("les intentions d'un invité ne se perdent pas non plus chez l'hôte", async () => {
    const { hote, invite } = await tableAvecInvite();
    await envoyer(invite, { t: "intention", fn: "passerAuTitanSuivant", args: [] });
    const a = await relever(hote, 0);
    const b = await relever(hote, 0);
    const intention = a.messages.find((m) => m.t === "intention");
    expect(intention).toBeTruthy();
    expect(b.messages.some((m) => m.t === "intention" && m.n === intention.n)).toBe(true);
  });

  it("un client plus ancien, sans accusé, garde l'ancienne livraison", async () => {
    const { hote, invite } = await tableAvecInvite();
    await envoyer(hote, { t: "prive", vers: invite.ref, charge: 1 });
    const r1 = await relever(invite);
    expect(r1.messages.some((m) => m.t === "prive")).toBe(true);
    await envoyer(hote, { t: "chat", texte: "suite" });
    const r2 = await relever(invite);
    expect(r2.messages.some((m) => m.t === "prive")).toBe(false);
  });
});

describe("Une seule adresse ne prend pas toute la table", () => {
  it("refuse une cinquième place à la même adresse, pas à une autre", async () => {
    const { salle, motDePasse } = await creerSalle({ pseudo: "Hôte", ip: "198.51.100.1" });
    for (let i = 0; i < 4; i++) {
      const r = await rejoindreSalle({ id: salle.id, motDePasse, pseudo: `A${i}`, ip: "203.0.113.7" });
      expect(r.erreur).toBeUndefined();
    }
    const cinquieme = await rejoindreSalle({ id: salle.id, motDePasse, pseudo: "A5", ip: "203.0.113.7" });
    expect(cinquieme.erreur).toMatch(/même adresse/);
    const ami = await rejoindreSalle({ id: salle.id, motDePasse, pseudo: "Ami", ip: "198.51.100.9" });
    expect(ami.erreur).toBeUndefined();
  });

  it("ne compte pas la boucle locale, par où arrive tout le monde sans DERRIERE_CLOUDFLARE", async () => {
    const { salle, motDePasse } = await creerSalle({ pseudo: "Hôte", ip: "127.0.0.1" });
    for (let i = 0; i < 6; i++) {
      const r = await rejoindreSalle({ id: salle.id, motDePasse, pseudo: `L${i}`, ip: "127.0.0.1" });
      expect(r.erreur).toBeUndefined();
    }
  });
});
