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

   Ce que ça coûte, et il faut le dire : sans l'hôte, personne ne calcule. Mais
   depuis le 2026-08-30, son absence n'efface plus rien — le relais garde la
   salle et son dernier instantané, annonce `hoteAbsent` à la table, et rend le
   moteur à l'hôte quand il revient (il redonne alors la clé du relais avec le
   mot de passe). Seule la fermeture explicite de la table envoie `hoteParti`,
   qui est la vraie fin.

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
  /* Trois nouvelles du 2026-08-30, toutes de la même famille : dire ce qui
     arrive aux gens plutôt que de laisser un plateau se figer sans explication.
     `depart` nomme celui qui s'en va et rend son Titan ; `hoteAbsent` dit que
     l'arbitre s'est tu SANS fermer la table ; `hoteRevenu` annonce sa reprise. */
  DEPART: "depart",
  HOTE_ABSENT: "hoteAbsent",
  HOTE_REVENU: "hoteRevenu",
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

function construireSession({
  base, id, jeton, ref, siege, joueurs, sieges, etat, versionEtat, motDePasse,
}) {
  const abonnes = {
    etat: new Set(), intention: new Set(), presence: new Set(),
    prive: new Set(), chat: new Set(), fin: new Set(), erreur: new Set(),
    depart: new Set(), liaison: new Set(),
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
          /* La salle a disparu, et le relais, lui, répond : ce n'est donc pas
             une coupure réseau. Deux causes seulement, et le joueur doit savoir
             laquelle : l'hôte a fermé sa table, ou le relais a été redémarré et
             a tout oublié (rien n'est jamais écrit sur disque). Dire « session
             terminée » laissait croire à une fin de partie normale. */
          emettre("fin", {
            raison: "Cette table n'existe plus sur le relais — elle a été fermée, ou le relais a redémarré.",
          });
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
          } else if (m.t === MESSAGE.DEPART) {
            emettre("depart", m);
          } else if (m.t === MESSAGE.HOTE_ABSENT) {
            /* Pas un `fin` : la table tient, son plateau aussi, et l'hôte peut
               revenir la reprendre. On le dit sur le canal des nouvelles de
               liaison, celui qui n'arrête rien. */
            emettre("liaison", {
              message: "L'hôte s'est déconnecté. La table reste ouverte : la partie reprendra à son retour.",
              grave: true,
            });
          } else if (m.t === MESSAGE.HOTE_REVENU) {
            emettre("liaison", { message: "L'hôte est de retour, la partie reprend.", grave: false });
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
        /* ── DIRE QUAND LE RELAIS N'EST PLUS LÀ ──
           Nikola, 2026-08-30 : « si le serveur a été fermé, il faut le savoir
           aussi, avec un message d'information ».

           Le message ne changeait jamais : « reprise en cours… », à l'infini,
           qu'il s'agisse d'un wifi qui hoquette une seconde ou de la fenêtre du
           relais fermée par mégarde. Le premier se rattrape tout seul et ne
           demande rien à personne ; le second ne se rattrapera jamais, et il
           faut aller rouvrir JOUER-A-DISTANCE.bat.

           Trois échecs d'affilée, c'est déjà sept secondes de silence : au-delà
           du hoquet, en deçà de la certitude. On nomme donc la cause probable à
           partir de là, sans arrêter la boucle — elle continue de réessayer, et
           se rattrape toute seule si le relais revient. */
        echecsDeSuite += 1;
        const message = echecsDeSuite >= 3
          ? "Le relais ne répond plus. Vérifie que la fenêtre JOUER-A-DISTANCE est toujours ouverte — la partie reprendra dès qu'il répondra."
          : "Connexion interrompue, reprise en cours…";
        emettre("erreur", { message, echecs: echecsDeSuite });
        const attente = Math.min(1000 * 2 ** (echecsDeSuite - 1), 10_000);
        await new Promise((ok) => { setTimeout(ok, attente); });
      }
    }
  }

  const session = {
    id, jeton, ref, siege, base,
    /* Le mot de passe tiré par le relais, à l'ouverture d'une table. Il ne vit
       QUE dans cet objet, en mémoire, pour que l'hôte puisse le lire à l'écran
       et le dicter. Il n'est jamais rangé dans `localStorage` : un secret écrit
       sur le disque survit à la partie, et rien n'a besoin qu'il survive. */
    motDePasse: motDePasse || null,
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

    /* ── REDEMANDER LE PLATEAU, SANS QUITTER LA PARTIE ──
       Nikola, 2026-08-30 : « l'interface de l'invité n'était plus actualisée,
       et quand je rafraîchis la page ça me remet sur le panneau d'accueil ;
       il faudrait un bouton refresh sans relancer le panneau d'accueil ».

       Recharger l'onglet est la mauvaise réponse à ce problème : la session
       ne vit qu'en mémoire, donc F5 la détruit et renvoie à l'accueil. Ce
       qu'on veut n'est pas de repartir de zéro, c'est de redemander l'état.

       Deux gestes, et ils comptent tous les deux. `version = 0` fait mentir
       le client sur ce qu'il a déjà vu : le relais ne descend l'état que
       s'il a bougé depuis la version annoncée, donc en repartant de zéro on
       le force à tout renvoyer. `abort()` solde le long-poll en cours, qui
       pouvait dormir encore vingt-cinq secondes avec l'ANCIEN numéro de
       version dans son URL — sans lui, le rafraîchissement n'aurait lieu
       qu'à la requête suivante, et le bouton semblerait ne rien faire. */
    resynchroniser() {
      if (!vivante) return;
      version = 0;
      controleur?.abort();
    },

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

/* Ouvrir une table. `cleRelais` est la phrase qui garde le relais de l'hôte —
   elle n'est demandée qu'ici, jamais pour rejoindre : les invités n'ont pas à
   la connaître, et elle ne circule donc qu'entre l'hôte et son propre relais.

   Le mot de passe de la table n'est PAS choisi ici : le relais le tire au sort
   et le rend une seule fois. La session le porte ensuite pour que l'hôte puisse
   le lire et le dicter — il n'existe nulle part ailleurs. */
export async function creerSession({ urlRelais, cleRelais, pseudo }) {
  const base = urlPropre(urlRelais);
  const res = await appeler(`${base}/api/creer`, {
    method: "POST",
    body: JSON.stringify({ cleRelais, pseudo }),
  });
  return construireSession({ base, ...res });
}

/* `cleRelais` est FACULTATIVE, et n'a qu'un seul usage : reprendre le siège
   d'hôte d'une table dont l'hôte s'est tu. Un invité n'en a jamais besoin et ne
   la connaît pas ; l'hôte qui revient la fournit, et le relais lui rend le
   moteur si et seulement si la place est libre. */
export async function rejoindreSession({ urlRelais, id, motDePasse, pseudo, cleRelais }) {
  const base = urlPropre(urlRelais);
  const res = await appeler(`${base}/api/rejoindre`, {
    method: "POST",
    body: JSON.stringify({ id: String(id || "").trim(), motDePasse, pseudo, cleRelais }),
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
