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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { serveur, salles, compteursIp, menage } from "../../server/relais.mjs";

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

/* La creation ne prend plus de mot de passe : le relais le TIRE et le rend une
   seule fois. Les tests recuperent donc `res.motDePasse` pour rejoindre, au lieu
   d'une constante ecrite en dur. */
async function creerPartie(cleRelais = undefined, pseudo = "Nikola") {
  const r = await poster("/api/creer", { cleRelais, pseudo });
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

  it("TIRE le mot de passe au lieu de le laisser choisir", async () => {
    /* Un mot de passe choisi à la main était le maillon faible : le plancher à
       quatre caractères invitait à taper « 1234 », et c'est la seule serrure de
       la table. Huit caractères sur trente-deux, soit ~2^40 : avec dix essais
       par quart d'heure et par adresse, c'est hors de portée. */
    const res = await creerPartie();
    const jeu = "[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}";
    expect(res.motDePasse).toMatch(new RegExp(`^${jeu}-${jeu}$`));
  });

  it("en tire un DIFFÉRENT à chaque table", async () => {
    // Un générateur cassé rendrait la même valeur : le test le verrait.
    const tirages = new Set();
    for (let i = 0; i < 12; i++) {
      tirages.add((await creerPartie()).motDePasse);
    }
    expect(tirages.size).toBe(12);
  });

  it("ne garde jamais le mot de passe en clair, même celui qu'il vient de tirer", async () => {
    const res = await creerPartie();
    const salle = [...salles.values()][0];
    const trace = JSON.stringify({ ...salle, participants: [...salle.participants.values()] });
    expect(trace).not.toContain(res.motDePasse);
    expect(Buffer.isBuffer(salle.empreinte)).toBe(true);
  });

  it("ne rend le mot de passe QU'À la création, jamais ensuite", async () => {
    /* Il n'existe en clair qu'un instant, dans la réponse à l'hôte. Ni la
       présence, ni le flux, ni l'arrivée d'un invité ne doivent le rejouer. */
    const hote = await creerPartie();
    const rejoint = await (await poster("/api/rejoindre", {
      id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy",
    })).json();
    expect(JSON.stringify(rejoint)).not.toContain(hote.motDePasse);

    const flux = await (await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=0`
    )).json();
    expect(JSON.stringify(flux)).not.toContain(hote.motDePasse);
  });
});

describe("La clé du relais garde la création", () => {
  /* Le seul vrai trou du montage précédent : `/api/creer` n'était pas
     authentifiée. Qui trouvait l'adresse du tunnel pouvait ouvrir des salles
     jusqu'à saturer le plafond, et empêcher les amis de l'hôte d'en créer une.

     REJOINDRE n'en demande pas : les invités n'ont rien de plus à connaître. */
  afterEach(() => { delete process.env.CLE_RELAIS; });

  it("sans clé configurée, la création reste ouverte — c'est le cas local", async () => {
    delete process.env.CLE_RELAIS;
    expect((await creerPartie()).statut).toBe(200);
  });

  it("avec une clé configurée, une création SANS clé est refusée", async () => {
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    const res = await creerPartie(undefined);
    expect(res.statut).toBe(403);
    expect(salles.size).toBe(0);
  });

  it("refuse une clé fausse, et l'échec compte pour la force brute", async () => {
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    for (let i = 0; i < 10; i++) {
      await creerPartie(`tentative${i}`);
    }
    // Même avec la BONNE clé, la porte est close : le compteur a parlé.
    expect((await creerPartie("HAVEFUN-EXEMPLE")).statut).toBe(429);
    expect(salles.size).toBe(0);
  });

  it("accepte la bonne clé", async () => {
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    const res = await creerPartie("HAVEFUN-EXEMPLE");
    expect(res.statut).toBe(200);
    expect(res.motDePasse).toBeTruthy();
  });

  it("ne renvoie jamais la clé, ni ne l'expose sur la route de santé", async () => {
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    const res = await creerPartie("HAVEFUN-EXEMPLE");
    expect(JSON.stringify(res)).not.toContain("HAVEFUN-EXEMPLE");
    const sante = await (await fetch(`${base}/api/sante`)).json();
    expect(JSON.stringify(sante)).not.toContain("HAVEFUN-EXEMPLE");
  });

  it("REJOINDRE ne demande pas la clé — un invité ne la connaît pas", async () => {
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    const hote = await creerPartie("HAVEFUN-EXEMPLE");
    const r = await poster("/api/rejoindre", {
      id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy",
    });
    expect(r.status).toBe(200);
  });

  it("une clé non-textuelle ne passe pas pour vide", async () => {
    /* Confusion de type : `{ cleRelais: [] }` ou `{ cleRelais: {} }` ne doit pas
       court-circuiter la comparaison. C'est la faute classique d'une garde
       écrite en `if (cle !== attendue)` sur une valeur non normalisée. */
    process.env.CLE_RELAIS = "HAVEFUN-EXEMPLE";
    for (const bidon of [[], {}, 0, true, null]) {
      const r = await poster("/api/creer", { cleRelais: bidon });
      expect(r.status).toBe(403);
    }
    expect(salles.size).toBe(0);
  });
});

describe("Rejoindre une salle", () => {
  it("laisse entrer avec le bon identifiant et le bon mot de passe", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy" });
    const res = await r.json();
    expect(r.status).toBe(200);
    expect(res.siege).toBe("invite");
    expect(res.joueurs).toHaveLength(2);
  });

  it("accepte l'identifiant en minuscules — il se dicte, il ne se copie pas", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", { id: hote.id.toLowerCase(), motDePasse: hote.motDePasse });
    expect(r.status).toBe(200);
  });

  it("refuse un mot de passe faux", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: "AAAA-AAAA" });
    expect(r.status).toBe(403);
  });

  it("dit EXACTEMENT la même chose pour une salle inconnue et un mot de passe faux", async () => {
    /* Les distinguer offrirait un oracle : on énumérerait les identifiants
       valides sans jamais connaître un seul mot de passe. */
    const hote = await creerPartie();
    const mauvaisMdp = await poster("/api/rejoindre", { id: hote.id, motDePasse: "faux" });
    const salleInconnue = await poster("/api/rejoindre", { id: "ZZZZZZ", motDePasse: "faux" });
    expect(mauvaisMdp.status).toBe(salleInconnue.status);
    expect(await mauvaisMdp.json()).toEqual(await salleInconnue.json());
  });

  it("ne révèle jamais le jeton complet d'un autre participant", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy" });
    const res = await r.json();
    // Le jeton vaut mot de passe : le sien seulement, jamais celui d'autrui.
    res.joueurs.forEach((j) => expect(j.ref.length).toBeLessThanOrEqual(12));
    expect(JSON.stringify(res.joueurs)).not.toContain(res.jeton);
    expect(JSON.stringify(res.joueurs)).not.toContain(hote.jeton);
  });

  it("neutralise un pseudo hostile", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", {
      id: hote.id,
      motDePasse: hote.motDePasse,
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
    const hote = await creerPartie();
    for (let i = 0; i < 10; i++) {
      await poster("/api/rejoindre", { id: hote.id, motDePasse: `essai${i}` });
    }
    // Le onzième essai ne teste même plus le mot de passe : la porte est close.
    const apres = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse });
    expect(apres.status).toBe(429);
  });
});

describe("Qui a le droit d'envoyer quoi", () => {
  async function tablePrete() {
    const hote = await creerPartie(undefined, "Nikola");
    const r = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy" });
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
    const hote = await creerPartie();
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

describe("Ce que la revue de sécurité du 2026-08-30 a fermé", () => {
  it("le hachage NE BLOQUE PLUS le serveur — une partie avance pendant les essais", async () => {
    /* La faille : `scryptSync` est lent EXPRÈS (~50 ms) et synchrone. Il bloquait
       l'unique fil de Node, donc TOUTES les autres requêtes. N'importe quel
       invité — il connaît l'identifiant de sa propre salle — gelait la table
       pour tout le monde en envoyant des mots de passe faux en boucle.

       Le test mesure ce qui compte pour un joueur : pendant qu'une rafale de
       mauvais mots de passe est en vol, un coup ordinaire passe-t-il vite ? */
    const hote = await creerPartie();
    const rafale = [];
    for (let i = 0; i < 24; i++) {
      rafale.push(poster("/api/rejoindre", { id: hote.id, motDePasse: `AAAA-${i}` }));
    }

    const depart = Date.now();
    const coup = await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton, message: { t: "etat", instantane: { m: 1 } },
    });
    const duree = Date.now() - depart;
    await Promise.all(rafale);

    expect(coup.status).toBe(200);
    /* Avec `scryptSync`, ce coup attendait derrière 24 hachages, soit largement
       plus d'une seconde. Le seuil est volontairement lâche : on vérifie que le
       serveur RÉPOND PENDANT, pas une performance au millième. */
    expect(duree).toBeLessThan(1000);
  });

  it("un en-tête d'adresse falsifié ne remet PAS le compteur à zéro", async () => {
    /* La faille : le relais lisait `x-forwarded-for` tel quel comme identité.
       En le changeant à chaque requête, chaque tentative retombait sur un
       compteur neuf — jamais banni, jamais limité — et la Map des compteurs
       enflait d'une entrée par requête. Il ne lit plus que `cf-connecting-ip`,
       que l'infrastructure Cloudflare écrase, et la socket. */
    const hote = await creerPartie();
    for (let i = 0; i < 11; i++) {
      await fetch(`${base}/api/rejoindre`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.0.${i}` },
        body: JSON.stringify({ id: hote.id, motDePasse: `AAAA-${i}` }),
      });
    }
    const apres = await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse });
    expect(apres.status).toBe(429);
  });

  it("une seule attente de flux vit par jeton", async () => {
    /* La faille : rien ne bornait le nombre de `/api/flux` concurrents pour un
       même jeton — autant de fermetures retenues et de minuteurs de 25 s. La
       nouvelle attente solde la précédente, donc l'ancienne se referme d'elle
       même au lieu de s'accumuler. */
    const hote = await creerPartie();
    const url = `${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=99`;
    const premiere = fetch(url).then((r) => r.json());
    await new Promise((ok) => { setTimeout(ok, 150); });
    const seconde = fetch(url).then((r) => r.json());
    await new Promise((ok) => { setTimeout(ok, 150); });

    // La première se referme sans attendre ses 25 s : c'est la seconde qui tient
    // désormais la place.
    await expect(premiere).resolves.toBeTruthy();
    const salle = salles.get(hote.id);
    expect(salle.attentesParJeton.size).toBeLessThanOrEqual(1);

    // On libère la seconde pour ne pas laisser traîner de requête ouverte.
    await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton, message: { t: "etat", instantane: { m: 1 } },
    });
    await seconde;
  });

  it("un corps démesuré est refusé sur les routes d'entrée", async () => {
    // « Créer » et « rejoindre » ne portent qu'un pseudo et un mot de passe :
    // leur laisser 2 Mo, c'était offrir la lecture et l'analyse de 2 Mo à qui
    // n'a même pas la clé.
    const enorme = "x".repeat(64 * 1024);
    /* La coupure se fait AU FIL DE L'EAU : le relais détruit la socket dès le
       dépassement, sans attendre la fin de l'envoi. Le client voit donc soit un
       400, soit une connexion coupée — les deux sont le bon comportement, et
       c'est justement de ne PAS avoir lu le reste qui compte. */
    let statut = "coupe";
    try { statut = (await poster("/api/creer", { pseudo: enorme })).status; } catch { /* socket coupée */ }
    expect(statut === "coupe" || statut === 400).toBe(true);
    expect(salles.size).toBe(0);

    // Et le relais est toujours debout juste après.
    expect((await creerPartie()).statut).toBe(200);
  });
});

describe("Quitter la table", () => {
  it("l'hôte qui part ferme la salle — sans lui il n'y a plus de moteur", async () => {
    const hote = await creerPartie();
    await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy" });
    await poster("/api/quitter", { id: hote.id, jeton: hote.jeton });
    expect(salles.has(hote.id)).toBe(false);
  });

  it("un invité qui part libère son siège, la partie continue", async () => {
    const hote = await creerPartie();
    const invite = await (await poster("/api/rejoindre", {
      id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy",
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

/* ============================================================
   CE QUI ARRIVE AUX GENS QUAND ILS PARTENT — 2026-08-30
   ============================================================
   Trois demandes de Nikola le même jour, et une seule idée derrière : une
   table ne se referme pas parce que quelqu'un s'absente.

     · « on doit savoir qui a quitté la partie » ;
     · « si c'est l'hôte, tant que le relais est ouvert on ne ferme pas la
       partie » ;
     · « si un joueur quitte, une IA reprend sa place ».

   Le relais tient les deux premières ; la troisième vit dans le contrôleur,
   mais elle a besoin de la première pour savoir QUEL Titan rendre à l'IA.
============================================================ */
describe("Un départ se nomme, et rend son siège", () => {
  it("annonce le partant et le Titan qu'il libère", async () => {
    const hote = await creerPartie();
    const r = await poster("/api/rejoindre", {
      id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy",
    });
    const invite = await r.json();

    // L'hôte lui donne le Titan 3, puis l'invité s'en va.
    await poster("/api/envoyer", {
      id: hote.id, jeton: hote.jeton,
      message: { t: "sieges", sieges: { 3: invite.ref } },
    });
    await poster("/api/quitter", { id: hote.id, jeton: invite.jeton });

    const flux = await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${hote.jeton}&versionEtat=0`
    ).then((x) => x.json());
    const depart = (flux.messages || []).find((m) => m.t === "depart");

    expect(depart).toBeTruthy();
    expect(depart.pseudo).toBe("Eddy");
    // Le siège part AVEC le message : l'hôte n'a pas à comparer deux listes.
    expect(depart.titanId).toBe(3);
    expect(flux.sieges[3]).toBeUndefined();
  });
});

describe("Un hôte muet ne ferme pas la table", () => {
  it("la salle survit au ménage, et la table est prévenue sans être coupée", async () => {
    const hote = await creerPartie();
    const invite = await poster("/api/rejoindre", {
      id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy",
    }).then((r) => r.json());

    // On vieillit l'hôte au-delà de sa grâce, sans toucher à l'invité.
    const salle = salles.get(hote.id);
    salle.participants.get(hote.jeton).vuLe = Date.now() - 10 * 60_000;
    menage();

    // La salle tient, avec son plateau : c'est tout l'enjeu.
    expect(salles.has(hote.id)).toBe(true);

    const flux = await fetch(
      `${base}/api/flux?id=${hote.id}&jeton=${invite.jeton}&versionEtat=0`
    ).then((r) => r.json());
    const types = (flux.messages || []).map((m) => m.t);
    expect(types).toContain("hoteAbsent");
    // Surtout PAS `hoteParti` : celui-là arrête la partie pour tout le monde.
    expect(types).not.toContain("hoteParti");
  });

  it("mais « Fermer la table » ferme bien la table", async () => {
    const hote = await creerPartie();
    await poster("/api/rejoindre", { id: hote.id, motDePasse: hote.motDePasse, pseudo: "Eddy" });
    await poster("/api/quitter", { id: hote.id, jeton: hote.jeton });
    expect(salles.has(hote.id)).toBe(false);
  });
});

describe("L'hôte reprend sa table", () => {
  it("récupère le moteur avec le mot de passe ET la clé du relais", async () => {
    process.env.CLE_RELAIS = "cle-de-test";
    try {
      const hote = await creerPartie("cle-de-test");
      const salle = salles.get(hote.id);
      salle.participants.get(hote.jeton).vuLe = Date.now() - 10 * 60_000;
      menage();

      const repris = await poster("/api/rejoindre", {
        id: hote.id, motDePasse: hote.motDePasse, pseudo: "Nikola",
        cleRelais: "cle-de-test",
      }).then((r) => r.json());

      expect(repris.siege).toBe("hote");
      expect(repris.repriseHote).toBe(true);
      // Jeton NEUF : l'ancien ne vaut plus rien, deux moteurs sur une table
      // sont exactement ce que tout ce montage évite.
      expect(repris.jeton).not.toBe(hote.jeton);
      expect(salles.get(hote.id).hote).toBe(repris.jeton);
    } finally {
      delete process.env.CLE_RELAIS;
    }
  });

  it("sans la clé, il rentre en simple invité", async () => {
    process.env.CLE_RELAIS = "cle-de-test";
    try {
      const hote = await creerPartie("cle-de-test");
      const salle = salles.get(hote.id);
      salle.participants.get(hote.jeton).vuLe = Date.now() - 10 * 60_000;
      menage();

      const res = await poster("/api/rejoindre", {
        id: hote.id, motDePasse: hote.motDePasse, pseudo: "Curieux",
      }).then((r) => r.json());

      expect(res.siege).toBe("invite");
      expect(res.repriseHote).toBe(false);
    } finally {
      delete process.env.CLE_RELAIS;
    }
  });

  it("tant que l'hôte est là, la clé ne donne pas son siège", async () => {
    process.env.CLE_RELAIS = "cle-de-test";
    try {
      const hote = await creerPartie("cle-de-test");
      // Aucun ménage : l'hôte relève toujours son courrier.
      const res = await poster("/api/rejoindre", {
        id: hote.id, motDePasse: hote.motDePasse, pseudo: "Doublon",
        cleRelais: "cle-de-test",
      }).then((r) => r.json());

      // Une table n'a jamais deux arbitres.
      expect(res.siege).toBe("invite");
      expect(salles.get(hote.id).hote).toBe(hote.jeton);
    } finally {
      delete process.env.CLE_RELAIS;
    }
  });
});
