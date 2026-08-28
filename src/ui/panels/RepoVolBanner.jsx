import React from "react";
import { smallBtn } from "../styles.js";
import { CARD_LABEL } from "../../domain/index.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

// Refonte UI (demande explicite) : appliquer le pattern DIL/RAGE — décision
// bloquante affichée juste sous l'en-tête, explication en une phrase, et
// UNIQUEMENT les choix valides — à d'autres points du jeu. Ce banner était
// auparavant noyé dans RoundPanels, avec un traitement visuel plus léger
// que DilRageBanner (pas de glow, bordure fine). Extrait ici en composant
// autonome, monté au même endroit (juste sous DilRageBanner dans
// GameView.jsx), avec exactement le même traitement visuel (bordure
// épaisse, halo lumineux, gros titre) pour que les deux décisions
// bloquantes du jeu (DIL/RAGE et Vol Phase Repos) soient immédiatement
// reconnaissables comme telles, où qu'on soit dans l'écran.
/* Les deux sens possibles de la chaîne, dits par ce qu'ils FONT et non par
   une orientation de table. La `cle` reste « gauche » / « droite » : c'est le
   vocabulaire du moteur (`resolveVolPhaseRepos`) et du livret, on ne le
   renomme pas pour un libellé.

   Correspondance, à relire dans `resolveVolPhaseRepos` : le voleur d'indice i
   prend au Titan d'indice i+1 de l'ordre parcouru. « droite » parcourt
   l'ordre de jeu tel quel — chacun vole donc celui qui joue APRÈS lui ;
   « gauche » le parcourt à l'envers — chacun vole celui qui joue AVANT. */
const T_MODE = "#ffd08a";

const SENS = [
  {
    cle: "droite",
    titre: "➡️ Chacun vole celui qui joue APRÈS lui",
    aide: "L'ordre de jeu est parcouru tel quel : tu prends une carte au Titan qui joue juste après toi, et c'est celui qui joue juste avant toi qui t'en prend une.",
  },
  {
    cle: "gauche",
    titre: "⬅️ Chacun vole celui qui joue AVANT lui",
    aide: "L'ordre de jeu est parcouru à l'envers : tu prends une carte au Titan qui joue juste avant toi, et c'est celui qui joue juste après toi qui t'en prend une.",
  },
];

export default function RepoVolBanner({ vm }) {
  const { phase, mancheNumber, titanState, titanModes, volDirection, volResume, modeVolRepos, chooseVolDirection, titanDisplayName } = vm;
  if (phase !== "repos") return null;

  const mainColor = "#e32347";
  const glowColor = "rgba(227,35,71,.45)";
  const detonateurId = titanState.detonateur;
  /* Le sens de la chaîne appartient au DÉTONATEUR. Les deux boutons étaient
     posés à l'écran quel que soit le propriétaire du jeton : c'était donc
     toujours l'humain qui tranchait, même quand le Détonateur était une IA
     (bug remonté par Nikola le 2026-08-17). Une IA Détonateur décide
     désormais elle-même — voir l'effet dédié dans le contrôleur — et ce
     bandeau se contente de l'annoncer. */
  const detonateurEstIa = titanModes && titanModes[detonateurId] === "ia";

  /* La chaîne réelle, nommée. On repart du Détonateur — c'est lui qui
     choisit, il doit se lire en premier — et on referme la boucle sur lui
     pour que le dernier maillon soit visible : sans ce retour, on ne voit pas
     qui prend une carte au dernier de la liste. */
  /* LA CHAÎNE EN ICÔNES, PAS EN NOMS — Nikola, 2026-08-28 : « pour le vol du
     repos ne mets pas les noms, mets les icônes, c'est plus parlant ».

     Quatre noms d'animaux enchaînés par des flèches se lisent mot à mot ; quatre
     pastilles colorées se lisent d'un coup d'œil, et ce sont les mêmes pastilles
     que le joueur voit déjà sur le plateau et sur les plaques de Titan. Le nom
     reste dans l'infobulle : on ne perd rien, on arrête juste de le lire. */
  const nom = (id) => (titanDisplayName ? titanDisplayName(id) : `Titan ${id}`);
  const ordreDe = (cle) => {
    const ordre = titanState.ordreJeu || [];
    if (ordre.length === 0) return [];
    const parcours = cle === "gauche" ? [...ordre].reverse() : [...ordre];
    const depart = Math.max(0, parcours.indexOf(detonateurId));
    const boucle = [...parcours.slice(depart), ...parcours.slice(0, depart)];
    return [...boucle, boucle[0]]; // refermée, pour voir le dernier maillon
  };
  const chaine = (cle) => {
    const boucle = ordreDe(cle);
    if (boucle.length === 0) return null;
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}
        title={boucle.map(nom).join(" vole → ")}
      >
        {boucle.map((id, i) => (
          <React.Fragment key={`${id}-${i}`}>
            {i > 0 && <span aria-hidden="true" style={{ opacity: .5 }}>→</span>}
            <TitanIcon titanId={id} size={16} variant="plain" />
          </React.Fragment>
        ))}
      </span>
    );
  };

  return (
    <div style={{
      background: "rgba(227,35,71,.18)",
      border: `2.5px solid ${mainColor}`,
      boxShadow: `0 0 0 3px ${glowColor}, 0 4px 18px ${glowColor}`,
      borderRadius: 12, padding: "9px 13px", marginBottom: 9, fontSize: ".85rem",
    }}>
      <div style={{
        fontFamily: "'Bowlby One', sans-serif", marginBottom: 6, fontSize: ".92rem",
        color: "#ff8fa3", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span aria-hidden="true">🎴</span>
        VOL EN CHAÎNE — Phase Repos M{mancheNumber}
      </div>

      {!volDirection ? (
        <div>
          <p style={{ marginBottom: 8, color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <TitanIcon titanId={detonateurId} size={18} /> {titanDisplayName ? titanDisplayName(detonateurId) : `Titan ${detonateurId}`} (Détonateur) choisit le sens de la chaîne :
          </p>
          {detonateurEstIa ? (
            <div style={{ color: "#a855f7", fontWeight: 700, fontSize: ".8rem" }}>
              🤖 Ce n'est pas ton choix — le Détonateur est une IA, elle tranche elle-même…
            </div>
          ) : (
          /* « GAUCHE » ET « DROITE » NE DISENT RIEN — Nikola, 2026-08-28 :
             « ce n'est pas hyper clair gauche / droite pour le choix du vol en
             chaîne ». Les deux mots décrivaient le SENS DE PARCOURS d'une table
             qui n'existe pas à l'écran : il n'y a pas de sièges, personne ne
             sait qui est à sa gauche. Le Détonateur tranchait donc à pile ou
             face une décision qui désigne qui lui prend une carte.

             Chaque bouton porte maintenant les deux seules choses qui
             comptent : la règle en une phrase (« tu voles celui qui joue après
             toi ») et la CHAÎNE RÉELLE de cette partie, nommée Titan par Titan.
             On lit qui prend à qui avant de cliquer, au lieu de l'apprendre au
             journal après coup. */
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
            {SENS.map((sens) => (
              <button
                key={sens.cle}
                onClick={() => chooseVolDirection(sens.cle)}
                title={sens.aide}
                style={{
                  ...smallBtn(true, "#e32347", "#C2185B"),
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                  textAlign: "left",
                  padding: "9px 13px",
                }}
              >
                <span style={{ fontWeight: 700 }}>{sens.titre}</span>
                <span style={{ fontSize: ".7rem", opacity: .85, fontWeight: 400 }}>
                  {chaine(sens.cle)}
                </span>
              </button>
            ))}
          </div>
          )}
          {/* LE MODE, DIT À L'ÉCRAN — Nikola, 2026-08-28 : « soit je me suis
              trompé de mode, soit un bug dans le mode pour voler les cartes à la
              phase Repos ». Les deux modes marchent (vérifié), mais ils se
              choisissent à l'écran d'accueil et RIEN ne les rappelait ensuite :
              la carte tombait dans une main ou dans une Zone Repos sans qu'on
              sache lequel des deux était attendu. Un mode qu'on ne peut pas
              relire est un mode dont on doute. */}
          <p style={{ marginTop: 8, fontSize: ".74rem", color: T_MODE }}>
            <strong>Règle de cette partie :</strong>{" "}
            {modeVolRepos === "repos"
              ? "Mise au repos — la carte tirée part en Zone Repos CHEZ SA VICTIME, personne ne la gagne."
              : "Emprunt — la carte tirée passe EN MAIN DU VOLEUR pour une Manche, puis retourne à son propriétaire."}
          </p>
          <p style={{ marginTop: 6, fontSize: ".72rem", color: "rgba(255,255,255,.5)" }}>
            Dans les deux cas, chaque Titan vole à l'aveugle 1 carte à la cible que le sens lui désigne — posée face visible en Zone Repos (consultable en permanence dans le bandeau de chaque Titan, jusqu'à la Manche {mancheNumber + 2}).
          </p>
        </div>
      ) : (
        <div>
          <div style={{ color: "#16E08C", fontSize: ".8rem", marginBottom: 6 }}>
            ✅ Vol résolu — {SENS.find((x) => x.cle === volDirection)?.titre ?? volDirection}
          </div>
          {/* La Manche suivante attend dix secondes (Nikola, 2026-08-28 : « fais
              ça plus lentement, qu'on voie qui vole quoi à qui »). On le DIT :
              une pause qu'on n'a pas demandée et qu'on ne comprend pas se lit
              comme un blocage. */}
          <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.55)", marginBottom: 7 }}>
            ⏳ La Manche suivante démarre dans quelques secondes — le temps de lire
            ce que chacun a perdu.
          </div>
          {/* QUI T'A PRIS QUOI — Nikola, 2026-08-28 : « je dois avoir une
              information claire de quelle carte quel Titan m'a pris à la phase
              repos ». C'était écrit au journal, donc invisible : il fallait
              ouvrir un panneau et remonter des dizaines de lignes pour trouver
              le seul événement de la Manche qui touche directement sa main.
              Le tableau le dit ici, une ligne par vol, en icônes. */}
          {(volResume || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {volResume.map((v, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                    fontSize: ".78rem", color: "rgba(255,255,255,.85)",
                    background: "rgba(0,0,0,.22)", borderRadius: 7, padding: "4px 8px",
                  }}
                >
                  <TitanIcon titanId={v.thiefId} size={16} variant="plain" />
                  <span style={{ opacity: .6 }}>prend</span>
                  <strong style={{ color: "#FFD93D" }}>{CARD_LABEL[v.cardId] ?? v.cardId}</strong>
                  <span style={{ opacity: .6 }}>à</span>
                  <TitanIcon titanId={v.victimId} size={16} variant="plain" />
                  <span style={{ opacity: .55, fontSize: ".7rem" }}>
                    {v.mode === "main"
                      ? `— empruntée, rendue fin de Manche ${v.revientALaManche}`
                      : `— en Zone Repos jusqu'à la Manche ${v.revientALaManche}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
