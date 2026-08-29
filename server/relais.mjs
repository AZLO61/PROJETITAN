/* ============================================================
   PROJET TITAN — LE RELAIS DE PARTIE À DISTANCE
   ============================================================
   Nikola, 2026-08-29 : « pouvoir jouer avec des joueurs à distance en donnant
   un ID de session et son mot de passe — ça m'évite de mettre le serveur en
   public, donc je m'évite énormément d'attaques, car ce sera mes connaissances
   qui vont me rejoindre. »

   ── CE QUE CE PROGRAMME EST, ET SURTOUT CE QU'IL N'EST PAS ──

   Il ne connaît PAS les règles de Projet Titan. Pas une carte, pas un Titan,
   pas un Seuil. Il ne sait faire qu'une chose : garder des salles en mémoire et
   recopier des messages d'un participant à l'autre. C'est délibéré, et c'est là
   que se trouve la vraie sécurité de ce montage — la chose joignable depuis
   Internet ne décide de rien. Le moteur du jeu, lui, reste dans le navigateur
   de l'hôte, sur SA machine, qui n'a aucun port ouvert.

   Un identifiant et un mot de passe n'empêchent pas d'exposer quelque chose :
   les invités doivent bien joindre un point de rendez-vous. Ce qu'ils changent,
   c'est CE QUI est exposé — un routeur ignorant plutôt qu'un ordinateur.

   ── AUCUNE DÉPENDANCE, ET POURQUOI ──

   Ni `ws`, ni Express, ni rien. Le transport est du long-polling HTTP sur le
   module `http` de Node. Pour un jeu au tour par tour à quatre, la latence d'un
   aller-retour HTTP est invisible, et ce choix supprime trois problèmes d'un
   coup : aucun `npm install` à faire tourner sur la machine exposée, aucune
   chaîne d'approvisionnement à surveiller, et un trafic qui passe à travers
   n'importe quel tunnel ou proxy — là où une WebSocket se fait couper.

   ── COMMENT ON LE LANCE ──

     node server/relais.mjs                    (port 8787 par défaut)
     PORT=9000 node server/relais.mjs

   Puis on le rend joignable SANS ouvrir de port sur la box, par un tunnel :

     cloudflared tunnel --url http://localhost:8787

   Cloudflare rend une URL en https://… ; c'est elle qu'on colle dans l'écran
   « Jouer à distance » du jeu. Voir docs/JOUER-A-DISTANCE.md.

   ── LES GARDE-FOUS ──

   Ils sont tous ici, en un seul endroit, et chacun répond à une attaque
   précise. Ils sont réglables par variables d'environnement, mais les valeurs
   par défaut visent le cas de Nikola : quelques amis, quelques parties.
============================================================ */

import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* ── RÉGLAGES ────────────────────────────────────────────── */

const PORT = Number(process.env.PORT || 8787);

/* `ORIGINES` liste les origines autorisées à parler au relais, séparées par des
   virgules. La valeur par défaut `*` laisse passer tout le monde : c'est le bon
   défaut ici, parce que la protection ne repose PAS sur l'origine (qu'un client
   non-navigateur choisit librement) mais sur le mot de passe de salle. Le
   réglage existe pour qui héberge le jeu à une adresse fixe et veut resserrer. */
const ORIGINES = (process.env.ORIGINES || "*").split(",").map((o) => o.trim());

const MAX_SALLES = Number(process.env.MAX_SALLES || 50);
const MAX_PARTICIPANTS = 8;            // 4 joueurs + spectateurs éventuels
const MAX_CORPS = 2 * 1024 * 1024;     // 2 Mo : un instantané complet pèse ~60 ko
const ATTENTE_FLUX_MS = 25_000;        // durée d'un long-poll avant réponse vide
const TTL_SALLE_MS = 4 * 60 * 60 * 1000;   // salle oubliée après 4 h sans vie
const TTL_PARTICIPANT_MS = 90_000;     // participant considéré parti après 90 s
const GRACE_HOTE_MS = 120_000;         // l'hôte peut recharger sa page sans tuer la partie

/* Anti-force-brute. Un mot de passe de salle est court par nature — il se dicte
   au téléphone. Il ne tient donc que si on limite les essais : dix échecs par
   adresse IP et par minute, puis quinze minutes de mise à l'écart. Sans ce
   compteur, six caractères tombent en quelques heures. */
const MAX_ECHECS = 10;
const FENETRE_ECHECS_MS = 60_000;
const BANNISSEMENT_MS = 15 * 60 * 1000;

/* Anti-inondation. Un client honnête envoie quelques messages par seconde au
   plus (un instantané par action). Soixante par dix secondes laisse une marge
   confortable tout en fermant la porte à une boucle qui sature la mémoire. */
const MAX_REQUETES = 60;
const FENETRE_REQUETES_MS = 10_000;

/* ── ÉTAT EN MÉMOIRE, JAMAIS SUR DISQUE ──────────────────── */

/** Map<idSalle, Salle>. Rien n'est persisté : couper le relais efface tout. */
const salles = new Map();

/** Map<ip, { echecs: number[], banniJusqua: number, requetes: number[] }> */
const compteursIp = new Map();

/* L'alphabet des identifiants de salle exclut I, O, 0 et 1 : un identifiant se
   dicte à voix haute, et c'est la seule confusion qui coûte vraiment. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function idSalle() {
  let sortie = "";
  const octets = randomBytes(6);
  for (let i = 0; i < 6; i++) sortie += ALPHABET[octets[i] % ALPHABET.length];
  return sortie;
}

function jeton() {
  return randomBytes(24).toString("hex");
}

/* Le mot de passe n'est jamais gardé en clair, même en mémoire vive, et jamais
   journalisé. `scrypt` est volontairement lent : il rend inutile le vol d'une
   empreinte, et son coût (~50 ms) est invisible sur une poignée de connexions.
   `timingSafeEqual` évite qu'un attaquant devine le mot de passe caractère par
   caractère en mesurant le temps de réponse. */
function empreinte(motDePasse, sel) {
  return scryptSync(String(motDePasse), sel, 32);
}

function motDePasseValide(salle, propose) {
  if (typeof propose !== "string" || propose.length === 0) return false;
  const candidat = empreinte(propose, salle.sel);
  return candidat.length === salle.empreinte.length
    && timingSafeEqual(candidat, salle.empreinte);
}

/* ── LIMITES PAR ADRESSE IP ──────────────────────────────── */

function compteur(ip) {
  let c = compteursIp.get(ip);
  if (!c) { c = { echecs: [], banniJusqua: 0, requetes: [] }; compteursIp.set(ip, c); }
  return c;
}

function estBanni(ip) {
  return compteur(ip).banniJusqua > Date.now();
}

function noterEchec(ip) {
  const c = compteur(ip);
  const maintenant = Date.now();
  c.echecs = c.echecs.filter((t) => maintenant - t < FENETRE_ECHECS_MS);
  c.echecs.push(maintenant);
  if (c.echecs.length >= MAX_ECHECS) {
    c.banniJusqua = maintenant + BANNISSEMENT_MS;
    c.echecs = [];
  }
}

function tropDeRequetes(ip) {
  const c = compteur(ip);
  const maintenant = Date.now();
  c.requetes = c.requetes.filter((t) => maintenant - t < FENETRE_REQUETES_MS);
  if (c.requetes.length >= MAX_REQUETES) return true;
  c.requetes.push(maintenant);
  return false;
}

/* ── CYCLE DE VIE DES SALLES ─────────────────────────────── */

function nettoyerPseudo(brut) {
  /* Un pseudo est affiché chez les autres joueurs : on le traite comme une
     donnée hostile. Pas de balise, pas de retour à la ligne, 18 caractères —
     la même limite que les noms de Titans dans l'écran d'accueil. */
  return String(brut ?? "").replace(/[<>&"'\r\n\t]/g, "").trim().slice(0, 18) || "Invité";
}

function creerSalle({ motDePasse, pseudo, ip }) {
  if (salles.size >= MAX_SALLES) return { erreur: "Le relais est plein, réessaie plus tard." };
  if (typeof motDePasse !== "string" || motDePasse.length < 4) {
    return { erreur: "Le mot de passe doit faire au moins 4 caractères." };
  }
  let id = idSalle();
  // Collision quasi impossible (32^6), mais une boucle coûte trois lignes.
  let essais = 0;
  while (salles.has(id) && essais++ < 20) id = idSalle();
  if (salles.has(id)) return { erreur: "Impossible de générer un identifiant, réessaie." };

  const sel = randomBytes(16);
  const jetonHote = jeton();
  const salle = {
    id,
    sel,
    empreinte: empreinte(motDePasse, sel),
    creeeLe: Date.now(),
    vueLe: Date.now(),
    hote: jetonHote,
    /* L'instantané courant, et lui seul. On ne garde JAMAIS un journal
       d'instantanés : ils pèsent des dizaines de kilo-octets, et un invité qui
       se reconnecte n'a besoin que du dernier — l'état d'avant ne se rejoue
       pas, il se remplace. C'est ce qui borne la mémoire du relais. */
    etat: null,
    versionEtat: 0,
    participants: new Map([[jetonHote, {
      pseudo: nettoyerPseudo(pseudo), siege: "hote", titanId: null, vuLe: Date.now(), ip,
    }]]),
    files: new Map([[jetonHote, []]]),
    sieges: {},          // { titanId: jetonInvite } — attribué par l'hôte
    attentes: new Set(),  // long-polls en cours, réveillés à chaque nouveauté
  };
  salles.set(id, salle);
  return { salle, jeton: jetonHote };
}

function rejoindreSalle({ id, motDePasse, pseudo, ip }) {
  const salle = salles.get(String(id || "").toUpperCase().trim());
  /* MÊME RÉPONSE POUR « SALLE INCONNUE » ET « MOT DE PASSE FAUX ».
     Les distinguer offrirait un oracle : on énumérerait les identifiants
     valides sans jamais connaître un mot de passe. Les deux cas comptent aussi
     pour un échec au compteur anti-force-brute, pour la même raison. */
  if (!salle || !motDePasseValide(salle, motDePasse)) {
    noterEchec(ip);
    return { erreur: "Identifiant ou mot de passe incorrect." };
  }
  if (salle.participants.size >= MAX_PARTICIPANTS) {
    return { erreur: "Cette partie est complète." };
  }
  const j = jeton();
  salle.participants.set(j, {
    pseudo: nettoyerPseudo(pseudo), siege: "invite", titanId: null, vuLe: Date.now(), ip,
  });
  salle.files.set(j, []);
  salle.vueLe = Date.now();
  reveiller(salle);
  return { salle, jeton: j };
}

function participant(salle, j) {
  return salle?.participants.get(j) || null;
}

/* ── LA RÉFÉRENCE PUBLIQUE D'UN PARTICIPANT ──
   Le jeton vaut mot de passe : le connaître, c'est pouvoir jouer à la place de
   son propriétaire. Il ne sort donc JAMAIS de la salle, pas même vers l'hôte.
   Tout ce qui circule — présence, sièges, expéditeur d'une intention,
   destinataire d'un message privé — se désigne par cette référence courte, que
   le relais seul sait retraduire en jeton. C'est ce qui permet à l'hôte
   d'adresser un message à un invité précis sans jamais pouvoir se faire passer
   pour lui. */
function refDe(salle, j) {
  return j === salle.hote ? "hote" : j.slice(0, 12);
}

function jetonDepuisRef(salle, ref) {
  if (ref === "hote") return salle.hote;
  for (const j of salle.participants.keys()) {
    if (j !== salle.hote && j.slice(0, 12) === ref) return j;
  }
  return null;
}

function presence(salle) {
  return [...salle.participants.entries()].map(([j, p]) => ({
    ref: refDe(salle, j),
    pseudo: p.pseudo,
    siege: p.siege,
    titanId: p.titanId,
  }));
}

/** Dépose un message dans la file de chaque destinataire, puis réveille les long-polls. */
function deposer(salle, destinataires, message) {
  destinataires.forEach((j) => {
    const file = salle.files.get(j);
    if (!file) return;
    /* Une file bornée : si un client ne relève plus son courrier, ses messages
       sont écartés au lieu de faire enfler la mémoire du relais. Il recevra de
       toute façon l'instantané courant à sa prochaine relève, qui le remet
       d'aplomb — c'est l'avantage d'un état complet plutôt qu'incrémental. */
    if (file.length >= 200) file.splice(0, file.length - 100);
    file.push(message);
  });
  reveiller(salle);
}

function reveiller(salle) {
  const attentes = [...salle.attentes];
  salle.attentes.clear();
  attentes.forEach((resoudre) => { try { resoudre(); } catch { /* client déjà parti */ } });
}

function retirerParticipant(salle, j) {
  const p = salle.participants.get(j);
  if (!p) return;
  const ref = refDe(salle, j);
  salle.participants.delete(j);
  salle.files.delete(j);
  Object.entries(salle.sieges).forEach(([titanId, occupant]) => {
    if (occupant === ref) delete salle.sieges[titanId];
  });
  deposer(salle, [...salle.participants.keys()],
    { t: "presence", joueurs: presence(salle), sieges: salle.sieges });
}

/* Le ménage. Il tourne toutes les 30 s et fait trois choses : oublier les
   participants muets, fermer les salles dont l'hôte n'est pas revenu, et purger
   les compteurs d'IP. Sans lui, une salle abandonnée garderait son instantané
   en mémoire jusqu'à l'arrêt du relais. */
function menage() {
  const maintenant = Date.now();
  salles.forEach((salle, id) => {
    [...salle.participants.entries()].forEach(([j, p]) => {
      const limite = j === salle.hote ? GRACE_HOTE_MS : TTL_PARTICIPANT_MS;
      if (maintenant - p.vuLe > limite) retirerParticipant(salle, j);
    });
    if (!salle.participants.has(salle.hote)) {
      /* L'hôte fait tourner le moteur : sans lui il n'y a plus de partie, juste
         des spectateurs devant un plateau figé. On le leur dit franchement
         plutôt que de les laisser attendre. */
      deposer(salle, [...salle.participants.keys()], { t: "hoteParti" });
      reveiller(salle);
      salles.delete(id);
      return;
    }
    if (maintenant - salle.vueLe > TTL_SALLE_MS) {
      reveiller(salle);
      salles.delete(id);
    }
  });
  compteursIp.forEach((c, ip) => {
    if (c.banniJusqua < maintenant && c.echecs.length === 0 && c.requetes.length === 0) {
      compteursIp.delete(ip);
    }
  });
}

/* ── TRANSPORT HTTP ──────────────────────────────────────── */

function origineAutorisee(origine) {
  if (ORIGINES.includes("*")) return "*";
  return ORIGINES.includes(origine) ? origine : null;
}

function repondre(reponse, code, corps, origine) {
  const autorisee = origineAutorisee(origine);
  const entetes = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    // Le relais ne sert aucune page : rien ici ne doit être interprété comme du
    // contenu par un navigateur qui pointerait dessus par erreur.
    "X-Content-Type-Options": "nosniff",
  };
  if (autorisee) {
    entetes["Access-Control-Allow-Origin"] = autorisee;
    entetes.Vary = "Origin";
  }
  reponse.writeHead(code, entetes);
  reponse.end(JSON.stringify(corps));
}

function lireCorps(requete) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    requete.on("data", (m) => {
      taille += m.length;
      /* La coupure se fait AU FIL DE L'EAU, pas après réception : accepter deux
         gigaoctets pour les refuser ensuite, c'est avoir déjà perdu. */
      if (taille > MAX_CORPS) { rejeter(new Error("corps trop grand")); requete.destroy(); return; }
      morceaux.push(m);
    });
    requete.on("end", () => {
      if (morceaux.length === 0) return resoudre({});
      try { resoudre(JSON.parse(Buffer.concat(morceaux).toString("utf8"))); }
      catch { rejeter(new Error("JSON invalide")); }
      return undefined;
    });
    requete.on("error", rejeter);
  });
}

function adresse(requete) {
  /* Derrière un tunnel Cloudflare, l'IP réelle arrive dans un en-tête. On lit
     le PREMIER maillon de `x-forwarded-for`, en repli sur la socket. Un client
     peut mentir sur cet en-tête, mais il ne gagne alors qu'un compteur
     anti-force-brute à lui : le mot de passe reste à trouver. */
  const transmise = requete.headers["x-forwarded-for"];
  if (typeof transmise === "string" && transmise.length > 0) return transmise.split(",")[0].trim();
  return requete.socket.remoteAddress || "inconnue";
}

const serveur = createServer(async (requete, reponse) => {
  const origine = requete.headers.origin || "";
  const url = new URL(requete.url, "http://relais.local");
  const ip = adresse(requete);

  if (requete.method === "OPTIONS") {
    const autorisee = origineAutorisee(origine);
    reponse.writeHead(autorisee ? 204 : 403, autorisee ? {
      "Access-Control-Allow-Origin": autorisee,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    } : {});
    reponse.end();
    return;
  }

  if (url.pathname === "/api/sante") {
    // Volontairement muet sur le contenu : ni identifiants de salles, ni
    // pseudos. Juste de quoi vérifier que le relais respire.
    repondre(reponse, 200, { ok: true, salles: salles.size }, origine);
    return;
  }

  if (estBanni(ip)) {
    repondre(reponse, 429, { erreur: "Trop de tentatives. Réessaie dans un quart d'heure." }, origine);
    return;
  }
  if (tropDeRequetes(ip)) {
    repondre(reponse, 429, { erreur: "Trop de requêtes." }, origine);
    return;
  }

  try {
    if (requete.method === "POST" && url.pathname === "/api/creer") {
      const corps = await lireCorps(requete);
      const res = creerSalle({ motDePasse: corps.motDePasse, pseudo: corps.pseudo, ip });
      if (res.erreur) { repondre(reponse, 400, { erreur: res.erreur }, origine); return; }
      repondre(reponse, 200, {
        id: res.salle.id, jeton: res.jeton, ref: refDe(res.salle, res.jeton), siege: "hote",
        joueurs: presence(res.salle), sieges: res.salle.sieges,
      }, origine);
      return;
    }

    if (requete.method === "POST" && url.pathname === "/api/rejoindre") {
      const corps = await lireCorps(requete);
      const res = rejoindreSalle({ id: corps.id, motDePasse: corps.motDePasse, pseudo: corps.pseudo, ip });
      if (res.erreur) { repondre(reponse, 403, { erreur: res.erreur }, origine); return; }
      deposer(res.salle, [...res.salle.participants.keys()],
        { t: "presence", joueurs: presence(res.salle), sieges: res.salle.sieges });
      repondre(reponse, 200, {
        id: res.salle.id, jeton: res.jeton, ref: refDe(res.salle, res.jeton), siege: "invite",
        joueurs: presence(res.salle), sieges: res.salle.sieges,
        etat: res.salle.etat, versionEtat: res.salle.versionEtat,
      }, origine);
      return;
    }

    if (requete.method === "POST" && url.pathname === "/api/envoyer") {
      const corps = await lireCorps(requete);
      const salle = salles.get(String(corps.id || "").toUpperCase());
      const p = participant(salle, corps.jeton);
      if (!salle || !p) { repondre(reponse, 403, { erreur: "Session inconnue." }, origine); return; }
      p.vuLe = Date.now();
      salle.vueLe = Date.now();

      const message = corps.message || {};
      /* ── QUI A LE DROIT D'ENVOYER QUOI ──
         Le relais ne juge pas le CONTENU (il ne connaît pas les règles), mais il
         tient la seule chose qu'il puisse tenir sans les connaître : la
         DIRECTION. L'état ne descend que de l'hôte, les intentions ne montent
         que vers lui. Sans cette règle, un invité diffuserait un faux plateau à
         toute la table. */
      if (message.t === "etat") {
        if (corps.jeton !== salle.hote) {
          repondre(reponse, 403, { erreur: "Seul l'hôte diffuse l'état." }, origine);
          return;
        }
        salle.etat = message.instantane ?? null;
        salle.versionEtat += 1;
        reveiller(salle);
        repondre(reponse, 200, { ok: true, versionEtat: salle.versionEtat }, origine);
        return;
      }

      if (message.t === "sieges") {
        if (corps.jeton !== salle.hote) {
          repondre(reponse, 403, { erreur: "Seul l'hôte attribue les sièges." }, origine);
          return;
        }
        salle.sieges = message.sieges && typeof message.sieges === "object" ? message.sieges : {};
        // Le siège se recopie sur le participant, pour que la présence le dise.
        salle.participants.forEach((part, j) => {
          const ref = refDe(salle, j);
          const trouve = Object.entries(salle.sieges).find(([, occupant]) => occupant === ref);
          part.titanId = trouve ? Number(trouve[0]) : null;
        });
        deposer(salle, [...salle.participants.keys()],
          { t: "presence", joueurs: presence(salle), sieges: salle.sieges });
        repondre(reponse, 200, { ok: true }, origine);
        return;
      }

      if (message.t === "intention") {
        if (corps.jeton === salle.hote) {
          repondre(reponse, 400, { erreur: "L'hôte joue en direct." }, origine);
          return;
        }
        /* L'intention part vers l'hôte SEUL, jamais vers les autres invités :
           c'est lui, et lui seul, qui décide si elle est recevable. Le relais
           ajoute l'expéditeur — un invité ne peut donc pas se faire passer pour
           un autre en le nommant dans sa charge utile. */
        deposer(salle, [salle.hote], {
          t: "intention",
          de: refDe(salle, corps.jeton),
          pseudo: p.pseudo,
          titanId: p.titanId,
          fn: String(message.fn || ""),
          args: Array.isArray(message.args) ? message.args : [],
          /* Les brouillons de l'invité (chemin tracé, mise d'Adrénaline). Le
             relais les transporte sans les lire — c'est l'hôte qui décide
             lesquels il adopte, à partir de sa propre liste blanche. */
          contexte: (message.contexte && typeof message.contexte === "object") ? message.contexte : {},
        });
        repondre(reponse, 200, { ok: true }, origine);
        return;
      }

      /* ── LE COURRIER PRIVÉ, ET POURQUOI IL EXISTE ──
         Projet Titan repose sur une programmation SECRÈTE : trois cartes
         choisies sans que personne ne les voie. Un instantané diffusé à toute
         la table porterait les mains de chacun — il suffirait d'ouvrir la
         console du navigateur pour lire le jeu de ses adversaires, et la phase
         de programmation perdrait tout son sens.

         L'hôte diffuse donc un plateau PUBLIC, mains masquées, et envoie à
         chaque invité sa seule main par ce canal. Le relais route sans lire :
         il ne sait pas qu'il transporte des cartes.

         Seul l'hôte peut écrire ici. Un invité qui pourrait adresser un message
         privé à un autre pourrait lui envoyer une fausse main. */
      if (message.t === "prive") {
        if (corps.jeton !== salle.hote) {
          repondre(reponse, 403, { erreur: "Seul l'hôte adresse du courrier privé." }, origine);
          return;
        }
        const destinataire = jetonDepuisRef(salle, String(message.vers || ""));
        if (!destinataire || destinataire === salle.hote) {
          repondre(reponse, 400, { erreur: "Destinataire inconnu." }, origine);
          return;
        }
        deposer(salle, [destinataire], { t: "prive", charge: message.charge ?? null });
        repondre(reponse, 200, { ok: true }, origine);
        return;
      }

      if (message.t === "chat") {
        const texte = String(message.texte || "").replace(/[<>]/g, "").slice(0, 240);
        if (texte) {
          deposer(salle, [...salle.participants.keys()],
            { t: "chat", pseudo: p.pseudo, texte, le: Date.now() });
        }
        repondre(reponse, 200, { ok: true }, origine);
        return;
      }

      repondre(reponse, 400, { erreur: "Type de message inconnu." }, origine);
      return;
    }

    if (requete.method === "GET" && url.pathname === "/api/flux") {
      const id = String(url.searchParams.get("id") || "").toUpperCase();
      const j = String(url.searchParams.get("jeton") || "");
      const versionVue = Number(url.searchParams.get("versionEtat") || 0);
      const salle = salles.get(id);
      const p = participant(salle, j);
      if (!salle || !p) { repondre(reponse, 403, { erreur: "Session inconnue." }, origine); return; }
      p.vuLe = Date.now();
      salle.vueLe = Date.now();

      const relever = () => {
        const file = salle.files.get(j) || [];
        const messages = file.splice(0, file.length);
        /* L'état ne descend QUE s'il a bougé depuis ce que le client dit avoir
           vu. C'est ce qui évite de renvoyer soixante kilo-octets toutes les
           vingt-cinq secondes à une table qui réfléchit. */
        const etatNeuf = salle.versionEtat > versionVue;
        return {
          messages,
          versionEtat: salle.versionEtat,
          etat: etatNeuf ? salle.etat : undefined,
          joueurs: presence(salle),
          sieges: salle.sieges,
        };
      };

      const premier = relever();
      if (premier.messages.length > 0 || premier.etat !== undefined) {
        repondre(reponse, 200, premier, origine);
        return;
      }

      /* Rien à dire : on tient la requête ouverte au lieu de répondre à vide. Le
         client rappelle aussitôt, la boucle se referme, et une table qui
         réfléchit ne génère aucun trafic. Le minuteur borne l'attente pour ne
         pas se faire couper par un proxy intermédiaire. */
      let fini = false;
      const terminer = () => {
        if (fini) return;
        fini = true;
        salle.attentes.delete(terminer);
        clearTimeout(minuteur);
        repondre(reponse, 200, relever(), origine);
      };
      const minuteur = setTimeout(terminer, ATTENTE_FLUX_MS);
      salle.attentes.add(terminer);
      requete.on("close", () => {
        if (fini) return;
        fini = true;
        salle.attentes.delete(terminer);
        clearTimeout(minuteur);
      });
      return;
    }

    if (requete.method === "POST" && url.pathname === "/api/quitter") {
      const corps = await lireCorps(requete);
      const salle = salles.get(String(corps.id || "").toUpperCase());
      if (salle && participant(salle, corps.jeton)) {
        if (corps.jeton === salle.hote) {
          deposer(salle, [...salle.participants.keys()], { t: "hoteParti" });
          salles.delete(salle.id);
        } else {
          retirerParticipant(salle, corps.jeton);
        }
      }
      repondre(reponse, 200, { ok: true }, origine);
      return;
    }

    repondre(reponse, 404, { erreur: "Route inconnue." }, origine);
  } catch {
    // Le message d'erreur reste générique : détailler renseignerait un curieux
    // sur la forme attendue des requêtes.
    repondre(reponse, 400, { erreur: "Requête invalide." }, origine);
  }
});

/* Les long-polls durent 25 s : le délai d'inactivité par défaut de Node
   couperait la connexion en plein vol. */
serveur.keepAliveTimeout = ATTENTE_FLUX_MS + 10_000;
serveur.headersTimeout = ATTENTE_FLUX_MS + 15_000;

const minuteurMenage = setInterval(menage, 30_000);
minuteurMenage.unref();

/* Importé par les tests, il ne doit pas écouter tout seul. Lancé à la main, il
   doit démarrer. */
const lanceDirectement = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, "/").split("/").pop()
);
if (lanceDirectement) {
  serveur.listen(PORT, () => {
    console.log(`Relais Projet Titan à l'écoute sur http://localhost:${PORT}`);
    console.log("Pour le rendre joignable sans ouvrir de port sur la box :");
    console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
  });
}

export { serveur, salles, compteursIp, menage, nettoyerPseudo, creerSalle, rejoindreSalle };
