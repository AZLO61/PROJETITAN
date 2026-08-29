/* ============================================================
   PROJET TITAN — LE CÔTÉ NAVIGATEUR DE LA PARTIE À DISTANCE
   ============================================================
   Une session est un fil ouvert vers le relais (`server/relais.mjs`). Ce module
   ne connaît rien au jeu : il ouvre le fil, le tient ouvert, et rend des
   messages. C'est le contrôleur qui décide de ce qu'ils veulent dire.

   ── LE MODÈLE : UN ARBITRE, DES MANETTES ──

   L'hôte fait tourner le moteur, exactement comme en local — le contrôleur ne
   change pas d'un iota chez lui. Il diffuse après chaque coup un instantané du
   plateau. Les invités ne calculent RIEN : ils affichent l'instantané reçu et
   renvoient des intentions (« je clique la case B1 »), que l'hôte accepte ou
   refuse.

   Ce n'est pas le modèle le plus élégant qui existe, c'est le seul qui soit
   honnête avec ce codebase : les règles vivent dans cinq mille lignes de moteur
   plus quatre mille de contrôleur React. Les faire tourner en double, chez
   quatre joueurs, en espérant qu'elles restent d'accord, c'est signer pour une
   classe de bugs qu'on ne referme jamais. Un seul arbitre, et le plateau qu'il
   voit fait foi.

   Ce que ça coûte, et il faut le dire : si l'hôte ferme son onglet, la partie
   s'arrête. Le relais l'annonce aux autres (`hoteParti`) au lieu de les laisser
   attendre devant un plateau figé.

   ── POURQUOI DU LONG-POLLING ──

   Pas de WebSocket, donc pas de dépendance, et un trafic qui passe partout —
   tunnel, proxy d'entreprise, wifi d'hôtel. On tient une requête ouverte 25 s ;
   dès qu'il se passe quelque chose, le relais répond et on rappelle aussitôt.
   Une table qui réfléchit ne génère donc aucun trafic.
============================================================ */

/** Types de messages que le relais sait router. Aucun n'est interprété par lui. */
export const MESSAGE = {
  ETAT: "etat",
  INTENTION: "intention",
  SIEGES: "sieges",
  PRIVE: "prive",
  CHAT: "chat",
  PRESENCE: "presence",
  HOTE_PARTI: "hoteParti",
};

export function urlPropre(brut) {
  /* On accepte ce que Nikola collera vraiment : une URL de tunnel avec ou sans
     barre finale, avec ou sans protocole. Une barre en trop produisait
     `https://xxx//api/creer`, que certains proxys refusent. */
  let url = String(brut || "").trim();
  if (!url) throw new Error("Adresse du relais manquante.");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

async function appeler(url, options = {}) {
  const reponse = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let corps = {};
  try { corps = await reponse.json(); } catch { corps = {}; }
  if (!reponse.ok) {
    /* Le message du relais est déjà écrit pour un joueur (« Identifiant ou mot
       de passe incorrect »). On le remonte tel quel plutôt que de le doubler
       d'un jargon HTTP qui n'apprend rien à qui le lit. */
    throw new Error(corps.erreur || `Le relais a répondu ${reponse.status}.`);
  }
  return corps;
}

/* ── LA SESSION ──────────────────────────────────────────── */

function construireSession({ base, id, jeton, ref, siege, joueurs, sieges, etat, versionEtat }) {
  const abonnes = {
    etat: new Set(), intention: new Set(), presence: new Set(),
    prive: new Set(), chat: new Set(), fin: new Set(), erreur: new Set(),
  };
  let vivante = true;
  let version = versionEtat || 0;
  let controleur = null;      // AbortController du long-poll en cours
  let echecsDeSuite = 0;

  const emettre = (canal, charge) => {
    abonnes[canal]?.forEach((cb) => {
      // Un abonné qui explose ne doit pas emporter la boucle réseau avec lui :
      // sans ce filet, une erreur d'affichage coupe la partie pour de bon.
      try { cb(charge); } catch (e) { console.error("[session]", canal, e); }
    });
  };

  async function envoyer(message) {
    if (!vivante) return null;
    return appeler(`${base}/api/envoyer`, {
      method: "POST",
      body: JSON.stringify({ id, jeton, message }),
    });
  }

  async function boucle() {
    while (vivante) {
      controleur = new AbortController();
      try {
        const reponse = await fetch(
          `${base}/api/flux?id=${encodeURIComponent(id)}&jeton=${encodeURIComponent(jeton)}&versionEtat=${version}`,
          { signal: controleur.signal }
        );
        if (!vivante) return;
        if (reponse.status === 403) {
          // La salle a disparu (hôte parti, relais redémarré) : inutile d'insister.
          emettre("fin", { raison: "Session terminée." });
          vivante = false;
          return;
        }
        const corps = await reponse.json();
        echecsDeSuite = 0;

        if (corps.versionEtat !== undefined) version = corps.versionEtat;
        if (corps.etat !== undefined && corps.etat !== null) emettre("etat", corps.etat);
        if (corps.joueurs) emettre("presence", { joueurs: corps.joueurs, sieges: corps.sieges || {} });

        let coupe = false;
        (corps.messages || []).forEach((m) => {
          if (m.t === MESSAGE.HOTE_PARTI) {
            emettre("fin", { raison: "L'hôte a quitté la partie." });
            coupe = true;
          } else if (m.t === MESSAGE.PRESENCE) {
            emettre("presence", { joueurs: m.joueurs, sieges: m.sieges || {} });
          } else if (m.t === MESSAGE.INTENTION) emettre("intention", m);
          else if (m.t === MESSAGE.PRIVE) emettre("prive", m.charge);
          else if (m.t === MESSAGE.CHAT) emettre("chat", m);
        });
        if (coupe) { vivante = false; return; }
      } catch (e) {
        if (!vivante) return;
        if (e?.name === "AbortError") continue;
        /* Une coupure réseau ne doit ni tuer la partie ni marteler le relais.
           On attend de plus en plus longtemps (1 s, 2 s, 4 s… plafonné à 10 s),
           et on prévient l'interface pour qu'elle dise « reconnexion » plutôt
           que de laisser croire que le tour est passé. */
        echecsDeSuite += 1;
        emettre("erreur", { message: "Connexion interrompue, reprise en cours…", echecs: echecsDeSuite });
        const attente = Math.min(1000 * 2 ** (echecsDeSuite - 1), 10_000);
        await new Promise((ok) => { setTimeout(ok, attente); });
      }
    }
  }

  const session = {
    id, jeton, ref, siege, base,
    estHote: siege === "hote",
    joueurs: joueurs || [],
    sieges: sieges || {},
    etatInitial: etat ?? null,

    sur(canal, cb) {
      abonnes[canal]?.add(cb);
      return () => abonnes[canal]?.delete(cb);
    },

    /** Hôte : diffuse le plateau public à toute la table. */
    diffuserEtat(instantane) {
      return envoyer({ t: MESSAGE.ETAT, instantane });
    },

    /** Hôte : envoie à UN invité ce que lui seul doit voir (sa main). */
    envoyerPrive(vers, charge) {
      return envoyer({ t: MESSAGE.PRIVE, vers, charge });
    },

    /** Hôte : dit qui tient quel Titan. */
    publierSieges(nouveauxSieges) {
      return envoyer({ t: MESSAGE.SIEGES, sieges: nouveauxSieges });
    },

    /** Invité : demande une action. L'hôte reste seul juge de sa recevabilité.
        `contexte` porte les brouillons composés localement — chemin tracé, mise
        d'Adrénaline — que l'hôte doit adopter avant de jouer le coup. */
    envoyerIntention(fn, args = [], contexte = {}) {
      return envoyer({ t: MESSAGE.INTENTION, fn, args, contexte });
    },

    envoyerChat(texte) {
      return envoyer({ t: MESSAGE.CHAT, texte });
    },

    estVivante() { return vivante; },

    async quitter() {
      if (!vivante) return;
      vivante = false;
      controleur?.abort();
      /* `keepalive` : la requête part même si la page se ferme dans la
         milliseconde qui suit. Sans lui, fermer l'onglet laissait un fantôme
         dans la salle pendant quatre-vingt-dix secondes. */
      try {
        await fetch(`${base}/api/quitter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, jeton }),
          keepalive: true,
        });
      } catch { /* on part, l'échec n'a plus d'importance */ }
    },
  };

  boucle();
  return session;
}

/* ── OUVRIR OU REJOINDRE ─────────────────────────────────── */

export async function creerSession({ urlRelais, motDePasse, pseudo }) {
  const base = urlPropre(urlRelais);
  const res = await appeler(`${base}/api/creer`, {
    method: "POST",
    body: JSON.stringify({ motDePasse, pseudo }),
  });
  return construireSession({ base, ...res });
}

export async function rejoindreSession({ urlRelais, id, motDePasse, pseudo }) {
  const base = urlPropre(urlRelais);
  const res = await appeler(`${base}/api/rejoindre`, {
    method: "POST",
    body: JSON.stringify({ id: String(id || "").trim(), motDePasse, pseudo }),
  });
  return construireSession({ base, ...res });
}

/** Vérifie qu'une adresse de relais répond, avant de demander un mot de passe. */
export async function testerRelais(urlRelais) {
  const base = urlPropre(urlRelais);
  const res = await appeler(`${base}/api/sante`);
  return Boolean(res.ok);
}

/* ── LE PLATEAU PUBLIC ET LE COURRIER PRIVÉ ──────────────── */

/* Ce que l'hôte a le droit de diffuser à tout le monde. Les mains et les cartes
   programmées en sont RETIRÉES et remplacées par leur nombre : un invité doit
   savoir qu'un adversaire a trois cartes en main, jamais lesquelles.

   Sans cette coupure, la programmation secrète — le cœur du jeu — tomberait à
   la première console de navigateur ouverte. Le tricheur ne verrait même pas
   qu'il triche : l'information serait simplement là, dans l'onglet Réseau. */
export function plateauPublic(instantane) {
  if (!instantane) return null;
  const copie = structuredClone(instantane);
  copie.titanState.players = copie.titanState.players.map((t) => ({
    ...t,
    hand: [],
    programmed: [],
    // Ce que la table a le droit de savoir : combien, jamais quoi.
    nbMain: (t.hand || []).length,
    nbProgrammees: (t.programmed || []).length,
    /* La défausse cachée porte bien son nom : elle reste cachée jusqu'au
       décompte, exactement comme à la table. */
    discardedHidden: (t.discardedHidden || []).map(() => "?"),
  }));
  return copie;
}

/** Ce qui n'appartient qu'à un joueur : sa main et ses cartes programmées. */
export function mainPrivee(instantane, titanId) {
  const t = instantane?.titanState?.players?.find((p) => p.id === Number(titanId));
  if (!t) return null;
  return {
    titanId: Number(titanId),
    hand: [...(t.hand || [])],
    programmed: [...(t.programmed || [])],
    discardedHidden: [...(t.discardedHidden || [])],
  };
}

/** Recolle la main privée sur le plateau public reçu. */
export function fusionnerMain(instantanePublic, main) {
  if (!instantanePublic || !main) return instantanePublic;
  const copie = structuredClone(instantanePublic);
  copie.titanState.players = copie.titanState.players.map((t) => (
    t.id === main.titanId
      ? {
        ...t,
        hand: [...main.hand],
        programmed: [...main.programmed],
        discardedHidden: [...main.discardedHidden],
      }
      : t
  ));
  return copie;
}
