import React, { useEffect, useRef, useState } from "react";
import { T, marquee, readout, label, prose } from "./theme.js";
import Icon from "./icons.jsx";
import { TitanIcon } from "./titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "./titans/constants.js";
import { creerSession, rejoindreSession } from "../net/session.js";
import { btnStyle, smallBtn, cancelBtn } from "./styles.js";

/* ============================================================
   JOUER À DISTANCE — LE PANNEAU DE L'ÉCRAN D'ACCUEIL
   ============================================================
   Nikola, 2026-08-29 : « pouvoir jouer avec des joueurs à distance en donnant
   un ID de session et son mot de passe ».

   Trois écrans, et un seul à la fois — c'est un formulaire d'arcade, pas un
   tableau de bord :

     · le choix    ouvrir une table, ou en rejoindre une ;
     · le salon    l'hôte voit qui arrive et donne les Titans ;
     · l'attente   l'invité voit son siège et patiente.

   L'ADRESSE DU RELAIS EST DEMANDÉE UNE FOIS ET RETENUE. C'est la seule chose
   pénible de ce montage — une URL de tunnel change à chaque redémarrage — et
   la retenir dans le navigateur évite de la retaper à chaque partie. Elle n'a
   rien de secret : c'est le mot de passe qui garde la porte, pas l'adresse.
============================================================ */

const CLE_RELAIS = "titan.relais.url";
const CLE_PSEUDO = "titan.relais.pseudo";

/* ── LE LIEN D'INVITATION ──────────────────────────────────
   Nikola, 2026-08-30 : « faudrait un lien partageable qui garde déjà en
   mémoire le nom du relais actualisé, l'ID de table et son mot de passe, avec
   l'ouverture de table — que ça soit ONE click ».

   Rejoindre demandait trois recopies à la main, dont deux chaînes sans sens :
   une adresse de tunnel qui change à chaque redémarrage, un identifiant de six
   caractères, un mot de passe de huit. Dicté au téléphone, ça rate une fois sur
   deux — et c'est le premier geste d'un joueur, celui où l'on ne pardonne rien.

   Le lien porte les trois. Ouvert, il rejoint tout seul : le joueur n'a rien à
   taper, et rien à comprendre.

   CE QUE ÇA COÛTE, ET IL FAUT LE DIRE : le mot de passe de la table voyage dans
   l'URL. Il finit donc dans l'historique du navigateur de celui qui clique, et
   dans le fil de discussion par lequel le lien a été envoyé — c'est un secret
   partagé avec tous ceux qui voient ce fil. Deux garde-fous, et ils ne le
   rendent pas inoffensif, seulement raisonnable : l'adresse est purgée de la
   barre dès que la connexion est faite (`replaceState`), et un mot de passe de
   table ne vaut que le temps de cette table-là — fermer la table et en rouvrir
   une en tire un autre. Ce qui NE voyage jamais dans un lien, c'est la clé du
   relais : elle, elle ouvre la porte de la machine. */
const PARAM_TABLE = "table";
const PARAM_MDP = "mdp";
const PARAM_RELAIS = "relais";

function lireInvitation() {
  try {
    const q = new URLSearchParams(window.location.search);
    const table = (q.get(PARAM_TABLE) || "").toUpperCase().trim();
    const mdp = (q.get(PARAM_MDP) || "").trim();
    const relais = (q.get(PARAM_RELAIS) || "").trim();
    if (!table || !mdp || !relais) return null;
    return { table, mdp, relais };
  } catch { return null; }
}

/* On efface les paramètres SANS recharger : la page reste celle qu'on regarde,
   la session tient, et le mot de passe quitte la barre d'adresse. */
function effacerInvitation() {
  try {
    window.history.replaceState({}, "", window.location.pathname);
  } catch { /* navigateur qui refuse l'historique : tant pis, on continue */ }
}

function fabriquerLien({ base, id, motDePasse }) {
  const racine = `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams({
    [PARAM_TABLE]: id,
    [PARAM_MDP]: motDePasse || "",
    [PARAM_RELAIS]: base,
  });
  return `${racine}?${q.toString()}`;
}

function lireMemoire(cle, defaut = "") {
  /* Un navigateur en navigation privée, ou réglé pour bloquer le stockage, fait
     LEVER une exception à la simple lecture — pas seulement rendre null. Sans
     ce filet, l'écran d'accueil ne s'afficherait pas du tout. */
  try { return window.localStorage.getItem(cle) ?? defaut; } catch { return defaut; }
}
function ecrireMemoire(cle, valeur) {
  try { window.localStorage.setItem(cle, valeur); } catch { /* tant pis */ }
}

export default function PanneauDistant({
  session, distantJoueurs, distantSieges, distantAvis,
  nbJoueurs, titanNames, titanModes,
  onBrancherSession, onQuitterSession, onPublierSieges,
  onLancer,
  monTitanDistant = null, onDemanderSiege = null,
}) {
  const [ecran, setEcran] = useState("ferme");   // ferme | choix | creer | rejoindre
  const [urlRelais, setUrlRelais] = useState(() => lireMemoire(CLE_RELAIS));
  const [pseudo, setPseudo] = useState(() => lireMemoire(CLE_PSEUDO, "Nikola"));
  /* Deux secrets, deux vies. La CLÉ DU RELAIS n'ouvre que la création et
     n'appartient qu'à l'hôte ; le MOT DE PASSE DE TABLE est tiré par le relais
     et se dicte aux invités. Aucun des deux n'est écrit sur le disque : seules
     l'adresse et le pseudo sont retenus. */
  const [cleRelais, setCleRelais] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [idSalle, setIdSalle] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [lienCopie, setLienCopie] = useState(false);
  /* ── CINQ SECONDES POUR SE RAVISER ──
     Nikola, 2026-09-01 : « après avoir cliqué sur "lancer partie" il faut
     laisser 5 secondes pour annuler ».

     Lancer est le geste le plus irréversible de cet écran : il fige le nombre
     de Titans, la difficulté et les sièges, et tire le plateau. Un clic de trop
     pendant qu'un dernier joueur finit d'arriver, et il faut fermer la table
     puis tout recommencer.

     `null` = aucun lancement en cours. Le compte vit dans un état pour
     l'affichage ET dans une variable locale au minuteur pour la décrémentation :
     lire l'état depuis l'intervalle rendrait une valeur figée au rendu qui l'a
     armé. Même piège que le compte à rebours de programmation. */
  const [compteAvantLancement, setCompteAvantLancement] = useState(null);
  const minuteurLancementRef = useRef(null);
  useEffect(() => () => { if (minuteurLancementRef.current) clearInterval(minuteurLancementRef.current); }, []);
  const annulerLancement = () => {
    if (minuteurLancementRef.current) clearInterval(minuteurLancementRef.current);
    minuteurLancementRef.current = null;
    setCompteAvantLancement(null);
  };
  const armerLancement = () => {
    if (minuteurLancementRef.current) return; // déjà armé : un second clic ne relance pas le compte
    let reste = 5;
    setCompteAvantLancement(reste);
    minuteurLancementRef.current = setInterval(() => {
      reste -= 1;
      if (reste > 0) { setCompteAvantLancement(reste); return; }
      clearInterval(minuteurLancementRef.current);
      minuteurLancementRef.current = null;
      setCompteAvantLancement(null);
      onLancer();
    }, 1000);
  };

  /* ── UN LIEN OUVERT REJOINT TOUT SEUL ──
     Le joueur clique le lien, la page s'ouvre, il est à la table. Aucun champ,
     aucun bouton — c'est ce que « ONE click » veut dire.

     La garde `tenteeRef` n'est pas décorative : cet effet ne doit partir
     qu'UNE fois. Sans elle, un échec (mauvais mot de passe, relais éteint)
     relancerait la tentative à chaque rendu, et l'écran d'accueil se mettrait
     à marteler le relais tout seul. */
  const tenteeRef = useRef(false);
  const [invitation] = useState(() => (typeof window === "undefined" ? null : lireInvitation()));
  useEffect(() => {
    if (!invitation || tenteeRef.current || session || !onBrancherSession) return;
    tenteeRef.current = true;
    setUrlRelais(invitation.relais);
    setIdSalle(invitation.table);
    setMotDePasse(invitation.mdp);
    setEcran("rejoindre");
    // `agir` est une déclaration de fonction, donc hissée : on peut l'appeler
    // ici bien qu'elle soit écrite plus bas.
    agir("rejoindre", {
      urlRelais: invitation.relais, idSalle: invitation.table, motDePasse: invitation.mdp,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitation, session, onBrancherSession]);

  const champ = {
    background: "rgba(0,0,0,.45)", color: T.text,
    border: `2px solid ${T.rule}`, borderRadius: T.rChip,
    padding: "9px 11px", fontFamily: T.ui, fontSize: T.body,
    fontWeight: 600, outline: "none", width: "100%", boxSizing: "border-box",
  };

  /* `valeurs` permet d'appeler cette fonction AVANT que React n'ait posé les
     champs correspondants — c'est le cas de la connexion automatique par lien,
     qui connaît l'adresse et le mot de passe un rendu avant que l'état ne les
     porte. Sans ce paramètre, elle partirait avec les champs vides. */
  async function agir(quoi, valeurs = {}) {
    const adresse = valeurs.urlRelais ?? urlRelais;
    const table = valeurs.idSalle ?? idSalle;
    const secret = valeurs.motDePasse ?? motDePasse;
    setOccupe(true);
    setErreur(null);
    try {
      ecrireMemoire(CLE_RELAIS, adresse);
      ecrireMemoire(CLE_PSEUDO, pseudo);
      const s = quoi === "creer"
        ? await creerSession({ urlRelais: adresse, cleRelais, pseudo })
        /* `cleRelais` part aussi en rejoignant, et elle est facultative : elle
           ne sert qu'à l'hôte qui REPREND sa propre table après s'être
           déconnecté. Vide, le relais l'ignore et rend un siège d'invité. */
        : await rejoindreSession({ urlRelais: adresse, id: table, motDePasse: secret, pseudo, cleRelais });
      onBrancherSession(s);
      // Le mot de passe a servi : il quitte la barre d'adresse.
      effacerInvitation();
      // Les deux secrets quittent les champs dès qu'ils ont servi. Celui de la
      // table réapparaît dans le salon, lu depuis la session, pas depuis ici.
      setMotDePasse("");
      setCleRelais("");
      /* On N'ENTRE PAS dans la partie ici. L'invité reste sur cet écran, en
         attente, et c'est le premier instantané de l'hôte marqué « partie
         lancée » qui le fait basculer. Entrer tout de suite lui montrait un
         plateau généré chez lui, remplacé une seconde plus tard : il croyait
         que la partie avait commencé sans lui. */
    } catch (e) {
      setErreur(e.message || "Impossible de joindre le relais.");
    } finally {
      setOccupe(false);
    }
  }

  /* ── L'INVITÉ : IL CHOISIT SON TITAN, PUIS IL ATTEND ──
     Il n'avait ici qu'une phrase d'attente : l'hôte distribuait les Titans, et
     l'invité découvrait le sien au lancement. Nikola, 2026-08-30 : « ils
     peuvent choisir un personnage libre ».

     C'est une sélection de personnage de borne d'arcade, et elle se lit comme
     telle — les portraits, qui est pris, qui est libre. Le clic ne fait que
     DEMANDER : l'hôte reste l'arbitre (il refuse un siège tenu par quelqu'un
     d'autre), et le résultat revient par la table des sièges, qui est la seule
     source de vérité. Un invité ne peut donc pas déloger quelqu'un en cliquant
     plus vite, et c'est pour ça que la demande passe par l'hôte plutôt que
     d'écrire directement dans la table.

     Un Titan tenu par l'IA se prend comme un Titan libre : c'est ce qui permet
     d'arriver en cours de partie, et de revenir à sa place après être parti. */
  if (session && session.siege === "invite") {
    const pseudoDe = (ref) => (distantJoueurs || []).find((j) => j.ref === ref)?.pseudo || "quelqu'un";
    return (
      <div style={{
        border: `2px solid ${T.tele}`, borderRadius: T.rPlate,
        padding: "12px 14px", marginBottom: 20, background: "rgba(184,140,255,.08)",
      }}>
        <div style={{ ...marquee(".9rem", T.tele), marginBottom: 6 }}>
          Connecté à la table {session.id}
        </div>
        <p style={{ ...prose(T.dim, T.small), margin: "0 0 10px" }}>
          Choisis un Titan libre. C&apos;est l&apos;hôte qui lance la partie :
          tu entreras automatiquement.
        </p>

        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {Array.from({ length: nbJoueurs }, (_, i) => i + 1).map((id) => {
            const tc = TITAN_COLORS[id];
            const occupant = distantSieges?.[id] || "";
            const estIa = titanModes?.[id] === "ia";
            const aMoi = monTitanDistant === id;
            const prisParUnAutre = Boolean(occupant) && !aMoi;
            /* Un Titan tenu par l'IA est LIBRE : c'est même le seul qui puisse
               encore l'être une fois la partie commencée (Nikola, 2026-08-30 :
               « il prend juste un Titan qui était géré par IA »). Seul un Titan
               tenu par quelqu'un d'autre est fermé. */
            const libre = !prisParUnAutre;
            return (
              <button
                key={id}
                onClick={() => { if (libre && !aMoi && onDemanderSiege) onDemanderSiege(id); }}
                disabled={!libre || aMoi}
                aria-pressed={aMoi}
                style={{
                  display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                  border: `2px solid ${aMoi ? (tc?.accent || T.you) : `${tc?.accent || T.rule}66`}`,
                  background: aMoi ? `${tc?.accent || T.you}22` : "transparent",
                  borderRadius: T.rChip, padding: "7px 9px", width: "100%",
                  cursor: libre && !aMoi ? "pointer" : "default",
                  opacity: libre || aMoi ? 1 : 0.55,
                }}
              >
                <TitanIcon titanId={id} size={22} variant="plain" />
                <span style={{ ...label(T.text, T.small), minWidth: 90 }}>
                  {titanNames?.[id] || `Titan ${id}`}
                </span>
                <span style={{ ...prose(aMoi ? (tc?.accent || T.you) : T.dim, T.micro), marginLeft: "auto" }}>
                  {aMoi
                    ? "c'est toi"
                    : prisParUnAutre
                    ? `pris par ${pseudoDe(occupant)}`
                    : estIa
                    ? "🤖 tenu par l'IA — clique pour le reprendre"
                    : "libre — clique pour le prendre"}
                </span>
              </button>
            );
          })}
        </div>

        {distantAvis && (
          <p style={{ ...prose(T.dim, T.micro), margin: "0 0 8px" }}>{distantAvis}</p>
        )}
        <button onClick={onQuitterSession} style={cancelBtn()}>Quitter la table</button>
      </div>
    );
  }

  /* ── L'HÔTE : LE SALON ── */
  if (session && session.siege === "hote") {
    const invites = (distantJoueurs || []).filter((j) => j.siege === "invite");
    const donnerSiege = (titanId, ref) => {
      const suite = { ...distantSieges };
      // Un joueur ne tient qu'un Titan : on libère son siège précédent.
      Object.keys(suite).forEach((k) => { if (suite[k] === ref) delete suite[k]; });
      if (ref) suite[titanId] = ref; else delete suite[titanId];
      onPublierSieges(suite);
    };

    return (
      <div style={{
        border: `2px solid ${T.you}`, borderRadius: T.rPlate,
        padding: "12px 14px", marginBottom: 20, background: "rgba(255,217,61,.07)",
      }}>
        <div style={{ ...marquee(".9rem", T.you), marginBottom: 8 }}>Table ouverte</div>

        {/* Ce qu'il faut dicter au téléphone, en gros et séparé : c'est la seule
            information que ce panneau existe pour transmettre. */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={label(T.faint, T.micro)}>Identifiant</div>
            <div style={readout("1.5rem", T.you)}>{session.id}</div>
          </div>
          {/* LE MOT DE PASSE EST TIRÉ AU SORT, PAS CHOISI (Nikola, 2026-08-30).
              Il ne s'affiche qu'ici, et une seule fois : le relais ne le garde
              que sous forme d'empreinte, personne ne peut le redemander. Fermer
              la table et en rouvrir une en tire un autre. */}
          <div>
            <div style={label(T.faint, T.micro)}>Mot de passe</div>
            <div style={readout("1.5rem", T.go)}>{session.motDePasse || "—"}</div>
          </div>
          <div>
            <div style={label(T.faint, T.micro)}>Adresse du relais</div>
            <div style={{ ...prose(T.dim, T.small), wordBreak: "break-all", maxWidth: 340 }}>
              {session.base}
            </div>
          </div>
        </div>
        {/* ── LE LIEN, QUI REMPLACE LES TROIS LIGNES ──
            Trois recopies à la main dont deux chaînes sans sens : c'est le
            premier geste d'un joueur, et celui où l'on ne pardonne rien. Le
            lien les porte toutes les trois et rejoint tout seul.
            Les trois lignes restent affichées au-dessus : il faut un chemin
            quand le lien ne passe pas — un fil qui mange les URL, un joueur
            qui préfère taper. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <button
            onClick={async () => {
              const lien = fabriquerLien({ base: session.base, id: session.id, motDePasse: session.motDePasse });
              try {
                await navigator.clipboard.writeText(lien);
                setLienCopie(true);
                setTimeout(() => setLienCopie(false), 2500);
              } catch {
                /* Presse-papiers refusé (page non sécurisée, permission) : on
                   ne perd pas le lien pour autant, on le met à l'écran pour
                   qu'il soit sélectionnable à la main. */
                setErreur(lien);
              }
            }}
            style={btnStyle(T.go)}
          >
            <Icon name="teleport" size={13} />
            {lienCopie ? "Lien copié !" : "Copier le lien d'invitation"}
          </button>
          <span style={prose(T.faint, T.micro)}>
            Un clic dessus et ton joueur est à la table, sans rien taper.
          </span>
        </div>
        {erreur && (
          <p style={{ ...prose(T.dim, T.micro), margin: "0 0 8px", wordBreak: "break-all" }}>
            Copie manuelle : {erreur}
          </p>
        )}
        <p style={{ ...prose(T.faint, T.micro), margin: "0 0 10px" }}>
          Le lien porte le mot de passe : il vaut la table entière, ne le publie
          pas. La clé du relais, elle, n&apos;y est jamais.
          {" "}Le mot de passe a été tiré au sort et ne s&apos;affiche
          qu&apos;ici : note-le maintenant, il ne pourra pas être retrouvé.
        </p>

        {invites.length === 0 ? (
          <p style={{ ...prose(T.dim, T.small), margin: "0 0 10px" }}>
            Personne n&apos;est encore arrivé.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {Array.from({ length: nbJoueurs }, (_, i) => i + 1).map((id) => {
              const tc = TITAN_COLORS[id];
              const occupant = distantSieges?.[id] || "";
              const estIa = titanModes?.[id] === "ia";
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  border: `1px solid ${tc?.accent || T.rule}66`,
                  borderRadius: T.rChip, padding: "6px 8px",
                }}>
                  <TitanIcon titanId={id} size={22} variant="plain" />
                  <span style={{ ...label(T.text, T.small), minWidth: 90 }}>
                    {titanNames?.[id] || `Titan ${id}`}
                  </span>
                  {estIa ? (
                    <span style={{ ...prose(T.tele, T.micro), marginLeft: "auto" }}>
                      🤖 tenu par l&apos;IA
                    </span>
                  ) : (
                    <select
                      value={occupant}
                      onChange={(e) => donnerSiege(id, e.target.value)}
                      aria-label={`Qui tient le Titan ${id}`}
                      style={{ ...champ, width: "auto", marginLeft: "auto", padding: "5px 8px" }}
                    >
                      <option value="">— toi, sur cet appareil —</option>
                      {invites.map((j) => (
                        <option key={j.ref} value={j.ref}>{j.pseudo}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {distantAvis && (
          <p style={{ ...prose(T.dim, T.micro), margin: "0 0 8px" }}>{distantAvis}</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {compteAvantLancement == null ? (
            <button onClick={armerLancement} style={btnStyle(T.you)}>
              Lancer la partie
            </button>
          ) : (
            <>
              {/* Le décompte occupe la place du bouton, il ne s'ajoute pas à
                  côté : tant qu'il tourne, il n'y a plus qu'une chose à
                  décider, et c'est de l'arrêter ou non. */}
              <span style={{ ...btnStyle(T.go), cursor: "default" }} aria-live="polite">
                Départ dans {compteAvantLancement}…
              </span>
              <button onClick={annulerLancement} style={btnStyle(T.stop)}>
                Annuler le lancement
              </button>
            </>
          )}
          <button onClick={onQuitterSession} style={cancelBtn()}>Fermer la table</button>
        </div>
      </div>
    );
  }

  /* ── PAS ENCORE CONNECTÉ ── */
  if (ecran === "ferme") {
    return (
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setEcran("choix")} style={btnStyle(null)}>
          <Icon name="teleport" size={13} /> Jouer à distance
        </button>
      </div>
    );
  }

  return (
    <div style={{
      border: `2px solid ${T.rule}`, borderRadius: T.rPlate,
      padding: "12px 14px", marginBottom: 20,
    }}>
      <div style={{ ...marquee(".9rem", T.you), marginBottom: 8 }}>Jouer à distance</div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <div>
          <label htmlFor="relais-url" style={label(T.faint, T.micro)}>
            Adresse du relais
          </label>
          <input
            id="relais-url" type="text" value={urlRelais}
            onChange={(e) => setUrlRelais(e.target.value)}
            placeholder="https://xxxx.trycloudflare.com"
            style={champ}
          />
        </div>
        <div>
          <label htmlFor="relais-pseudo" style={label(T.faint, T.micro)}>Ton nom</label>
          <input
            id="relais-pseudo" type="text" value={pseudo} maxLength={18}
            onChange={(e) => setPseudo(e.target.value)}
            style={champ}
          />
        </div>
      </div>

      {ecran === "choix" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setEcran("creer")} style={btnStyle(T.you)}>
            Ouvrir une table
          </button>
          <button onClick={() => setEcran("rejoindre")} style={btnStyle(null)}>
            Rejoindre une table
          </button>
          <button onClick={() => setEcran("ferme")} style={cancelBtn()}>Annuler</button>
        </div>
      )}

      {(ecran === "creer" || ecran === "rejoindre") && (
        <div style={{ display: "grid", gap: 8 }}>
          {ecran === "rejoindre" && (
            <div>
              <label htmlFor="relais-id" style={label(T.faint, T.micro)}>
                Identifiant de la table
              </label>
              <input
                id="relais-id" type="text" value={idSalle} maxLength={6}
                onChange={(e) => setIdSalle(e.target.value.toUpperCase())}
                placeholder="AB3K7P"
                style={{ ...champ, letterSpacing: ".2em" }}
              />
            </div>
          )}
          {/* ── OUVRIR : LA CLÉ DU RELAIS ──
              Elle garde le relais lui-même, pas la table. Sans elle, quiconque
              trouvait l'adresse du tunnel pouvait ouvrir des salles jusqu'à le
              saturer. Elle n'est demandée QU'ICI : un invité n'en a jamais
              besoin, et elle ne circule donc qu'entre l'hôte et sa machine.
              Elle n'est pas retenue sur le disque — un secret écrit survit à la
              partie, et rien n'a besoin qu'il survive. */}
          {ecran === "creer" && (
            <div>
              <label htmlFor="relais-cle" style={label(T.faint, T.micro)}>
                Clé du relais
              </label>
              <input
                id="relais-cle" type="password" value={cleRelais}
                onChange={(e) => setCleRelais(e.target.value)}
                autoComplete="off"
                style={champ}
              />
              <p style={{ ...prose(T.faint, T.micro), margin: "4px 0 0" }}>
                La phrase posée par <strong>JOUER-A-DISTANCE.bat</strong>. Tes
                joueurs n&apos;en ont pas besoin.
              </p>
            </div>
          )}

          {/* ── REJOINDRE : LE MOT DE PASSE DE LA TABLE ──
              À la création, il n'est plus saisi : le relais le tire au sort et
              l'affiche une fois dans le salon. */}
          {ecran === "rejoindre" && (
            <div>
              <label htmlFor="relais-mdp" style={label(T.faint, T.micro)}>
                Mot de passe de la table
              </label>
              {/* `type="password"` et non `text` : un écran de joueur est
                  souvent visible par d'autres personnes dans la pièce. */}
              <input
                id="relais-mdp" type="password" value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                autoComplete="off"
                placeholder="XXXX-XXXX"
                style={champ}
              />
            </div>
          )}

          {/* ── REPRENDRE SA PROPRE TABLE ──
              Depuis que l'absence de l'hôte n'efface plus la salle, il faut un
              chemin pour y revenir. C'est le même formulaire — la table n'a pas
              changé d'identifiant ni de mot de passe — plus la clé du relais,
              que seul l'hôte connaît. Le relais ne rend le moteur que si la
              place est réellement vacante : une table n'a jamais deux arbitres.

              Facultatif, et discret : neuf joueurs sur dix n'y touchent jamais. */}
          {ecran === "rejoindre" && (
            <details>
              <summary style={{ ...label(T.faint, T.micro), cursor: "pointer" }}>
                Tu es l&apos;hôte et tu reprends ta table ?
              </summary>
              <div style={{ marginTop: 8 }}>
                <label htmlFor="relais-cle-reprise" style={label(T.faint, T.micro)}>
                  Clé du relais
                </label>
                <input
                  id="relais-cle-reprise" type="password" value={cleRelais}
                  onChange={(e) => setCleRelais(e.target.value)}
                  autoComplete="off"
                  style={champ}
                />
                <p style={{ ...prose(T.faint, T.micro), margin: "4px 0 0" }}>
                  Elle te rend le moteur de la partie, à condition que ta place
                  soit libre. Tes joueurs n&apos;en ont pas besoin.
                </p>
              </div>
            </details>
          )}
          {erreur && (
            <p style={{ ...prose("#ef4444", T.small), margin: 0 }}>{erreur}</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => agir(ecran)}
              disabled={occupe || !urlRelais
                || (ecran === "creer" && cleRelais.length === 0)
                || (ecran === "rejoindre" && (motDePasse.length === 0 || idSalle.length !== 6))}
              style={btnStyle(T.you)}
            >
              {occupe ? "Connexion…" : ecran === "creer" ? "Ouvrir" : "Rejoindre"}
            </button>
            <button onClick={() => { setEcran("choix"); setErreur(null); }} style={cancelBtn()}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
