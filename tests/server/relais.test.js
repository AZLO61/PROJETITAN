/* ============================================================
   PROJET TITAN — LE RELAIS TIENT SA PORTE
   ============================================================
   Le relais est la seule pièce de ce jeu joignable depuis Internet. Tout ce
   qu'il promet doit donc être vérifié, pas supposé — et ce sont les garanties
   de SÉCURITÉ qui comptent ici, pas le confort de jeu :

     · un mot de passe faux n'ouvre rien, et n'apprend rien ;
     · un invité ne peut pas diffuser d'état à la table ;
     · un invité ne peut pas se faire passer pour un autre ;
     · la force brute s'épuise ;
     · un pseudo hostile ne traverse pas.

   Le serveur écoute sur un port éphémère (`listen(0)`) : les tests ne peuvent
   pas se marcher dessus, et rien ne reste ouvert après coup.
============================================================ */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { serveur, salles, compteursIp } from "../../server/relais.mjs";

let base = "";

beforeAll(async () => {
  await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
  const { port } = serveur.address();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((ok) => serveur.close(ok));
});

beforeEach(() => {
  salles.clear();
  compteursIp.clear();
});

const poster = (route, corps) => fetch(`${base}${route}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corps),
});

async function creerPartie(motDePasse = "titan2026", pseudo = "Nikola") {
  const r = await poster("/api/creer", { motDePasse, pseudo });
  return { statut: r.status, ...(await r.json()) };
}

describe("Le relais respire", () => {
  it("répond à la route de santé sans rien révéler des salles", async () => {
    await creerPartie();
    const r = await fetch(`${base}/api/sante`);
    const corps = await r.json();
    expect(r.status).toBe(200);
    expect(corps.ok).toBe(true);
    expect(corps.salles).toBe(1);
    // Ni identifiant, ni pseudo, ni empreinte : la route est publique.
    expect(JSON.stringify(corps)).not.toMatch(/[A-Z2-9]{6}/);
  });
});

describe("Créer une salle", () => {
  it("rend un identifiant dictable à voix haute", async () => {
    const res = await creerPartie();
    expect(res.statut).toBe(200);
    // Six caractères, sans I, O, 0 ni 1 : les seules confusions qui coûtent.
    expect(res.id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(res.siege).toBe("hote");
    expect(res.jeton).toHaveLength(48);
  });

  it("refuse un mot de passe trop court", async () => {
    const res = await creerPartie("abc");
    expect(res.statut).toBe(400);
    expect(salles.size).toBe(0);
  });

  it("ne garde jamais le mot de passe en clair", async () => {
    await creerPartie("motDePasseTresSecret");
    const salle = [...salles.values()][0];
    const trace = JSON.stringify({ ...salle, participants: [...salle.participants.values()] });
    expect(trace).not.toContain("motDePasseTresSecret");
    expect(Buffer.isBuffer(salle.empreinte)).toBe(true);
  });
});

describe("Rejoindre une salle", () => {
  it("laisse entrer avec le bon identifiant et le bon mot de passe", async () => {
    const hote = await creerPartie("titan2026");
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2026", pseudo: "Eddy" });
    const res = await r.json();
    expect(r.status).toBe(200);
    expect(res.siege).toBe("invite");
    expect(res.joueurs).toHaveLength(2);
  });

  it("accepte l'identifiant en minuscules — il se dicte, il ne se copie pas", async () => {
    const hote = await creerPartie("titan2026");
    const r = await poster("/api/rejoindre", { id: hote.id.toLowerCase(), motDePasse: "titan2026" });
    expect(r.status).toBe(200);
  });

  it("refuse un mot de passe faux", async () => {
    const hote = await creerPartie("titan2026");
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2027" });
    expect(r.status).toBe(403);
  });

  it("dit EXACTEMENT la même chose pour une salle inconnue et un mot de passe faux", async () => {
    /* Les distinguer offrirait un oracle : on énumérerait les identifiants
       valides sans jamais connaître un seul mot de passe. */
    const hote = await creerPartie("titan2026");
    const mauvaisMdp = await poster("/api/rejoindre", { id: hote.id, motDePasse: "faux" });
    const salleInconnue = await poster("/api/rejoindre", { id: "ZZZZZZ", motDePasse: "faux" });
    expect(mauvaisMdp.status).toBe(salleInconnue.status);
    expect(await mauvaisMdp.json()).toEqual(await salleInconnue.json());
  });

  it("ne révèle jamais le jeton complet d'un autre participant", async () => {
    const hote = await creerPartie("titan2026");
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2026", pseudo: "Eddy" });
    const res = await r.json();
    // Le jeton vaut mot de passe : le sien seulement, jamais celui d'autrui.
    res.joueurs.forEach((j) => expect(j.ref.length).toBeLessThanOrEqual(12));
    expect(JSON.stringify(res.joueurs)).not.toContain(res.jeton);
    expect(JSON.stringify(res.joueurs)).not.toContain(hote.jeton);
  });

  it("neutralise un pseudo hostile", async () => {
    const hote = await creerPartie("titan2026");
    const r = await poster("/api/rejoindre", {
      id: hote.id,
      motDePasse: "titan2026",
      pseudo: '<img src=x onerror="alert(1)">',
    });
    const res = await r.json();
    const entre = res.joueurs.find((j) => j.siege === "invite");
    expect(entre.pseudo).not.toContain("<");
    expect(entre.pseudo).not.toContain(">");
  });
});

describe("La force brute s'épuise", () => {
  it("met l'adresse à l'écart après dix échecs", async () => {
    const hote = await creerPartie("titan2026");
    for (let i = 0; i < 10; i++) {
      await poster("/api/rejoindre", { id: hote.id, motDePasse: `essai${i}` });
    }
    // Le onzième essai ne teste même plus le mot de passe : la porte est close.
    const apres = await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2026" });
    expect(apres.status).toBe(429);
  });
});

describe("Qui a le droit d'envoyer quoi", () => {
  async function tablePrete() {
    const hote = await creerPartie("titan2026", "Nikola");
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2026", pseudo: "Eddy" });
    const invite = await r.json();
    return { hote, invite };
  }

  it("l'hôte diffuse l'état, et sa version avance", async () => {
    const { hote } = await tablePrete();
    const r = await poster("/api/envoyer", {
      id: hote.id,
      jeton: hote.jeton,
      message: { t: "etat", instantane: { phase: "action" } },
    });
    const res = await r.json();
    expect(r.status).toBe(200);
    expect(res.versionEtat).toBe(1);
  });

  it("un invité NE PEUT PAS diffuser d'état à la table", async () => {
    /* La garantie centrale du montage. Le relais ne connaît pas les règles, il
       ne peut donc pas juger un plateau — mais il tient la direction, et c'est
       ce qui empêche un invité de peindre un faux plateau chez les autres. */
    const { hote, invite } = await tablePrete();
    const r = await poster("/api/envoyer", {
      id: hote.id,
      jeton: invite.jeton,
      message: { t: "etat", instantane: { triche: true } },
    });
    expect(r.status).toBe(403);
    expect([...salles.values()][0].etat).toBeNull();
  });

  it("un invité NE PEUT PAS attribuer les sièges", async () => {
    const { hote, invite } = await tablePrete();
    const r = await poster("/api/envoyer", {
      id: hote.id, jeton: invite.jeton, message: { t: "sieges", sieges: { 1: invite.ref } },
    });
    expect(r.status).toBe(403);
  });

  it("le courrier privé va au seul destinataire, et seul l'hôte l'écrit", async () => {
    /* C'est ce canal qui rend la programmation secrète possible à distance :
       le plateau part en clair à toute la table, la main de chacun part à lui
       seul. Un invité qui pourrait l'écrire enverrait une fausse main. */
    const { hote, invite } = await tablePrete();

    const refuse = await poster("/api/envoyer", {
      id: hote.id, jeton: invite.jeton,
      message: { t: "prive", vers: "hote", charge: { main: ["tout_casser"] } },
    });
    expect(refuse.status).toBe(403);

    await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton,
      message: { t: "prive", vers: invite.ref, charge: { main: ["tout_casser", "graouhhh"] } },
    });

    // L'invité le reçoit…
    const chezInvite = await (await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${invite.jeton}&versionEtat=0`
    )).json();
    const prive = chezInvite.messages.find((m) => m.t === "prive");
    expect(prive.charge.main).toEqual(["tout_casser", "graouhhh"]);

    // …et personne d'autre. La file de l'hôte est vide de ce message.
    const chezHote = await (await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=0`,
      { signal: AbortSignal.timeout(1200) }
    ).then((r) => r.json()).catch(() => ({ messages: [] })));
    expect(chezHote.messages.some((m) => m.t === "prive")).toBe(false);
  });

  it("une intention ne monte QU'À L'HÔTE, avec son expéditeur ajouté par le relais", async () => {
    const { hote, invite } = await tablePrete();
    await poster("/api/envoyer", {
      id: hote.id,
      jeton: invite.jeton,
      // L'invité tente de se faire passer pour quelqu'un d'autre.
      message: { t: "intention", fn: "placerTitanJoueur", args: ["B1"], de: "usurpé", pseudo: "Nikola" },
    });
    const flux = await fetch(`${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=0`);
    const res = await flux.json();
    const intention = res.messages.find((m) => m.t === "intention");
    expect(intention.fn).toBe("placerTitanJoueur");
    expect(intention.args).toEqual(["B1"]);
    // Le relais écrase ce que l'invité prétendait être.
    expect(intention.de).toBe(invite.ref);
    expect(intention.pseudo).toBe("Eddy");
    // Et l'hôte n'apprend PAS le jeton de l'invité : le connaître, ce serait
    // pouvoir jouer à sa place.
    expect(intention.de).not.toBe(invite.jeton);
  });

  it("un jeton inconnu n'envoie rien", async () => {
    const { hote } = await tablePrete();
    const r = await poster("/api/envoyer", {
      id: hote.id, jeton: "00".repeat(24), message: { t: "etat", instantane: {} },
    });
    expect(r.status).toBe(403);
  });
});

describe("Le flux ne renvoie l'état que s'il a bougé", () => {
  it("descend l'état neuf, puis se tait tant que rien ne change", async () => {
    const hote = await creerPartie("titan2026");
    await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton, message: { t: "etat", instantane: { manche: 1 } },
    });

    const premier = await (await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=0`
    )).json();
    expect(premier.etat).toEqual({ manche: 1 });
    expect(premier.versionEtat).toBe(1);

    /* Deuxième relève en annonçant la version déjà vue : le relais ne renvoie
       PAS les soixante kilo-octets de l'instantané. Sans cette règle, une table
       qui réfléchit dix minutes rejouerait l'état vingt-quatre fois pour rien.
       La requête reste alors ouverte 25 s faute de nouveauté — on la coupe donc
       nous-mêmes plutôt que d'attendre, et c'est cette coupure qui prouve le
       silence. */
    await expect(
      fetch(`${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=1`, {
        signal: AbortSignal.timeout(1200),
      }).then((r) => r.json())
    ).rejects.toThrow();
  });
});

describe("Quitter la table", () => {
  it("l'hôte qui part ferme la salle — sans lui il n'y a plus de moteur", async () => {
    const hote = await creerPartie("titan2026");
    await poster("/api/rejoindre", { id: hote.id, motDePasse: "titan2026", pseudo: "Eddy" });
    await poster("/api/quitter", { id: hote.id, jeton: hote.jeton });
    expect(salles.has(hote.id)).toBe(false);
  });

  it("un invité qui part libère son siège, la partie continue", async () => {
    const hote = await creerPartie("titan2026");
    const invite = await (await poster("/api/rejoindre", {
      id: hote.id, motDePasse: "titan2026", pseudo: "Eddy",
    })).json();
    await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton, message: { t: "sieges", sieges: { 2: invite.ref } },
    });
    await poster("/api/quitter", { id: hote.id, jeton: invite.jeton });

    const salle = salles.get(hote.id);
    expect(salle).toBeTruthy();
    expect(salle.participants.size).toBe(1);
    expect(salle.sieges).toEqual({});
  });
});
