import React from "react";
import { CARD_LABEL, CARD_FORCE } from "../../domain/cards.js";
import { TITAN_COLORS } from "./constants.js";
import { TitanIcon } from "./TitanVisuals.jsx";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME, baremeHint } from "../blockNames.js";

// ============================================================
// BANDEAU RESSOURCES TITANS
// ============================================================
// La carte de chaque Titan empilait nom, case, adrénaline, blocs par
// couleur, socles avec leur détail, Bagarre, Destruction et Repos — le tout
// autour de 9 px. À quatre joueurs, cela faisait une quarantaine de petits
// chiffres à déchiffrer en permanence.
//
// Hiérarchie retenue : ce qu'on surveille à chaque tour reste affiché
// (Repaire et Adrénaline), ce qu'on ne consulte qu'au moment de compter
// (socles détaillés, pistes ADN, Repos) passe en seconde ligne discrète
// avec l'infobulle pour le détail.
//
// L'animation `titanPulse` du Titan actif a été retirée : une pulsation
// infinie pendant une partie d'1h30 fatigue l'œil et vide la batterie
// d'une tablette. La bordure et le halo fixes suffisent à le désigner.

export default function TitanResourceBand({
  titans, selectedTitanId, onSelect, activePlayerId, phase, titanDisplayName,
  titanModes = {}, titanProfiles = {}, profilsReveles = {}, revelerProfil, profileLabel,
  waitingNextTitan = false, titansEnAttente = [],
}) {
  /* QUAND LA TABLETTE CHANGE DE MAINS, PLUS RIEN N'EST PRIVÉ.
     Bug remonté par Nikola le 2026-08-17 : « même pendant l'inter-tour je
     peux consulter mes cartes au survol des carrés jaunes pleins ».

     `activePlayerId` reste sur le joueur qui vient de jouer TANT QUE
     « ▶ Titan suivant » n'a pas été cliqué — c'est-à-dire exactement
     pendant qu'on se passe l'appareil. Se fier à lui seul rouvrait donc la
     fuite d'information que le retrait du survol avait fermée le 15 août :
     l'adversaire qui reçoit la tablette n'a qu'à survoler pour lire la
     programmation restante.

     `waitingNextTitan` marque précisément cette fenêtre. Pendant l'inter-tour,
     plus aucun Titan n'est « le mien » et tout ce qui est secret le redevient. */
  const enInterTour = Boolean(waitingNextTitan);
  const estSonTour = (id) => activePlayerId === id && !enInterTour;
  const enAttenteIds = new Set((titansEnAttente || []).map((x) => x.id));
  const colorCount = (titan) => {
    const c = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
    titan.repaire.forEach((x) => { if (c[x] !== undefined) c[x]++; });
    return c;
  };

  // Easter-egg demandé par Nikola : 10 clics sur l'encart d'un Titan IA
  // dévoilent son profil. C'est une triche volontaire, réservée à qui la
  // cherche — le profil reste sinon caché jusqu'au décompte final.
  // Le compteur vit dans une ref : le faire passer par un state
  // re-rendrait toute la bande à chaque clic, sans rien changer à
  // l'affichage tant que le seuil n'est pas atteint.
  const clicsRef = React.useRef({});
  const CLICS_POUR_REVELER = 10;

  const compterClic = (id) => {
    if (!revelerProfil || titanModes[id] !== "ia" || profilsReveles[id]) return;
    const n = (clicsRef.current[id] || 0) + 1;
    clicsRef.current[id] = n;
    if (n >= CLICS_POUR_REVELER) revelerProfil(id);
  };

  return (
    // Grille a colonnes egales : en flex, le dernier Titan s'etirait sur
    // toute la largeur restante des qu'il passait a la ligne.
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(165px, 100%), 1fr))",
      gap: 8, marginBottom: 14,
    }}>
      {titans.map((t) => {
        const tc = TITAN_COLORS[t.id] || TITAN_COLORS[1];
        const isSelected = selectedTitanId === t.id;
        const isActive = activePlayerId === t.id && phase === "action";
        const counts = colorCount(t);
        const soclesTotal = (t.socles || []).reduce((s, v) => s + v, 0);
        // Le detail des cartes n'est lisible que sur son propre Titan : la
        // programmation des adversaires reste secrete.
        const estMoi = estSonTour(t.id);

        return (
          <div
            key={t.id}
            onClick={() => { compterClic(t.id); onSelect(t.id); }}
            style={{
              borderRadius: 12, cursor: "pointer", minWidth: 0,
              // Le liseré porte toujours la couleur du Titan : le jaune du
              // cas "selectionne + actif" faisait croire que le Titan 1 avait
              // change de couleur.
              border: isSelected && isActive
                ? `3px solid ${tc.accent}`
                : isSelected
                ? `2px solid ${tc.accent}`
                : isActive
                ? `2.5px solid ${tc.accent}`
                : "1.5px solid rgba(255,255,255,.1)",
              padding: "9px 11px",
              // Aplat uni plutot qu'un degrade : le degrade derriere le Titan
              // salissait la lecture des icones de blocs posees dessus.
              background: isActive
                ? `${tc.accent}1c`
                : isSelected ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
              boxShadow: isActive ? `0 0 0 3px ${tc.accent}44, 0 0 22px ${tc.accent}55` : "none",
              transition: "border-color .2s, background .2s, box-shadow .2s",
            }}
          >
            {/* Identité + Adrénaline */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
              {/* variant="border" : contour a la couleur du Titan sur fond
                  neutre. L'aplat en degrade derriere le sprite alourdissait
                  la carte, surtout quand le Repaire est vide. */}
              <TitanIcon titanId={t.id} size={26} variant="plain" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: ".76rem", fontFamily: "'Bowlby One', sans-serif", color: tc.accent,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`}{isActive ? " ▶" : ""}
                </div>
                <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.5)", display: "flex", alignItems: "center", gap: 4 }}>
                  {/* HORS DU RING — remplace un panneau entier.
                      Un Titan éjecté avait droit à son propre encart en haut
                      de page, avec titre, explication et liste. À quatre
                      panneaux empilés (éjecté, décision à résoudre, consigne
                      de phase, étape du tour), l'écran ne montrait plus le
                      jeu. Nikola le 2026-08-17 : « une petite icône sur
                      l'encart du Titan, c'est suffisant ». L'information
                      utile — qui est dehors et par où il rentre — tient dans
                      l'infobulle, juste à côté de la case. */}
                  {enAttenteIds.has(t.id) && (
                    <span
                      title={`Hors de BIG CITY — ${titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`} rentre par ${t.cell} au début de son tour, pas avant`}
                      style={{ cursor: "help" }}
                      aria-label="Hors du ring"
                    >
                      🥊
                    </span>
                  )}
                  {t.cell}
                </div>
              </div>
              <div
                title="Adrénaline disponible"
                style={{ fontSize: ".72rem", fontWeight: 700, color: "#86ff71", whiteSpace: "nowrap" }}
              >
                💉 {t.adrenaline || 0}
              </div>
            </div>

            {/* Repaire : la ressource qu'on surveille à chaque tour */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", minHeight: 22 }}>
              {["bleu", "rose", "orange", "rouge", "vert"].map((c) =>
                counts[c] > 0 ? (
                  <div
                    key={c}
                    title={baremeHint(c, counts[c])}
                    style={{ display: "flex", alignItems: "center", gap: 3, cursor: "help" }}
                  >
                    <BlockIcon color={c} size={18} />
                    <span style={{
                      fontSize: ".72rem", fontWeight: 700, color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {counts[c]}
                    </span>
                  </div>
                ) : null
              )}
              {t.repaire.length === 0 && (
                <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.35)" }}>Repaire vide</span>
              )}
            </div>

            {/* Profil de l'IA, seulement une fois dévoilé. */}
            {titanModes[t.id] === "ia" && profilsReveles[t.id] && profileLabel && (
              <div
                title="Profil de cette IA : sa force et son tempérament"
                style={{ fontSize: ".66rem", color: "#a855f7", fontWeight: 700, marginTop: 4 }}
              >
                🤖 {profileLabel(titanProfiles[t.id])}
              </div>
            )}

            {/* Compteurs de fin de partie : consultés au décompte, pas à chaque tour */}
            <div style={{
              display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
              fontSize: ".68rem", color: "rgba(255,255,255,.5)",
              marginTop: 6, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,.07)",
              minHeight: 22,
            }}>
              <span
                title={(t.socles || []).length > 0
                  ? `Socles collectés : ${t.socles.join(" + ")} = ${soclesTotal} pts`
                  : "Aucun socle collecté"}
                style={{ cursor: "help", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}assets/rules/socle.png`}
                  alt="" aria-hidden="true"
                  // Meme gabarit que BlockIcon dans cette rangee, et centrage
                  // vertical sur la ligne de base du texte comme les emojis
                  // voisins : l'icone flottait au-dessus des chiffres.
                  style={{ width: 17, height: 17, objectFit: "contain", filter: "brightness(1.2)", display: "block", position: "relative", top: 1 }}
                />
                {soclesTotal}
              </span>
              <span title="Piste ADN Bagarre" style={{ cursor: "help" }}>💪 {t.bagarre || 0}</span>
              <span title="Piste ADN Destruction" style={{ cursor: "help" }}>💥 {t.destruction || 0}</span>
              {/* Cartes de la Manche : jouees, defaussees, restantes. Seul le
                  nombre est public, jamais lesquelles — la programmation
                  reste secrete. */}
              {/* Cartes de la Manche : 3 carrés jaunes, pleins au départ, qui
                  se vident à mesure qu'elles sont jouées. On lit le nombre de
                  cartes qu'il reste, pas celles déjà passées. Seul le nombre
                  est public, jamais lesquelles. */}
              {(() => {
                const joueesOuDefaussees = t.playedThisManche.length + (t.discardedHidden || []).length;
                const total = joueesOuDefaussees + t.programmed.length;
                if (total === 0) return null;
                /* CE QUE LE SURVOL RÉVÈLE — arbitrage Nikola du 2026-08-17.

                   · CARRÉ PLEIN (carte encore à jouer) : le nom n'apparaît
                     que sur SON PROPRE Titan, c'est-à-dire celui à qui c'est
                     le tour et donc celui qui tient l'appareil. Sur tous les
                     autres, le carré ne dit rien de plus que « il lui en
                     reste une ». C'est la nuance qui manquait le 2026-08-15 :
                     le survol avait alors été retiré POUR TOUT LE MONDE parce
                     que la tablette circule, alors qu'il suffisait de le
                     réserver au propriétaire des cartes.

                   · CARRÉ VIDE (carte jouée ou défaussée) : nom ET Force,
                     sur TOUS les Titans. Une carte résolue est publique, et
                     sa Force sert à estimer une Bagarre à venir — c'est
                     précisément pour ça que Nikola la demande.

                   Réserve assumée : une carte DÉFAUSSÉE face cachée reste
                   anonyme (elle n'a jamais été révélée à la table), seul son
                   carré passe en vide. */
                const estMoi = estSonTour(t.id);
                const cases = [
                  ...t.programmed.map((cardId) => ({ restante: true, cardId })),
                  ...t.playedThisManche.map((cardId) => ({ restante: false, cardId })),
                  ...(t.discardedHidden || []).map(() => ({ restante: false, cardId: null })),
                ];
                const libelle = (c) => {
                  if (c.restante) {
                    return estMoi
                      ? `Encore à jouer : ${CARD_LABEL[c.cardId]} (Force ${CARD_FORCE[c.cardId]})`
                      : "Carte encore à jouer — programmation secrète";
                  }
                  if (!c.cardId) return "Carte défaussée face cachée — jamais révélée";
                  return `Déjà jouée : ${CARD_LABEL[c.cardId]} (Force ${CARD_FORCE[c.cardId]})`;
                };
                return (
                  <span
                    title={`${t.programmed.length} carte(s) encore à jouer sur ${total} cette Manche`}
                    style={{ display: "inline-flex", gap: 3, alignItems: "center", cursor: "help", marginLeft: "auto" }}
                  >
                    {cases.map((c, i) => (
                      <span
                        key={i}
                        title={libelle(c)}
                        style={{
                          // `flexShrink: 0` : ces carrés vivent dans un
                          // conteneur flex. Sans lui ils se laissent comprimer
                          // en largeur quand la ligne est chargée, pendant que
                          // la hauteur reste fixe — d'où les rectangles
                          // verticaux remontés par Nikola le 2026-08-17.
                          // `alignSelf` empêche l'étirement dans l'autre sens.
                          width: 9, height: 9, flexShrink: 0, alignSelf: "center",
                          borderRadius: 2, display: "inline-block", boxSizing: "border-box",
                          background: c.restante ? "#FFD93D" : "transparent",
                          border: "1.5px solid #FFD93D",
                        }}
                      />
                    ))}
                  </span>
                );
              })()}
              {(t.repos || []).length > 0 && (() => {
                /* Respecte faceUp : une carte volée en Phase Repos est
                   publique, une carte mise en Repos par Fatigue reste anonyme
                   POUR LES ADVERSAIRES.

                   Demande de Nikola (2026-08-17) : « je peux consulter mes
                   cartes en Fatigue au survol de l'icône dans mon encart de
                   Titan. » Ce sont ses cartes, il subit la Fatigue, il a le
                   droit de savoir laquelle lui a été prise — sans quoi il ne
                   peut pas anticiper sa Manche suivante. Même garde-fou que
                   les carrés de programmation ci-dessus : le détail n'est
                   lisible que sur SON propre Titan, celui à qui c'est le tour
                   et qui tient donc l'appareil. */
                const visibleNames = t.repos
                  .filter((e) => e.faceUp || estMoi)
                  .map((e) => `${CARD_LABEL[e.cardId]}${e.faceUp ? "" : " (Fatigue)"}`);
                const hiddenCount = t.repos.length - visibleNames.length;
                const detail = [
                  visibleNames.length ? visibleNames.join(", ") : null,
                  hiddenCount ? `${hiddenCount} carte(s) cachée(s) par Fatigue` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <span
                    title={`Zone Repos, indisponible jusqu'à la Manche suivante : ${detail}`}
                    style={{ color: "#ff8fa3", fontWeight: 700, cursor: "help" }}
                  >
                    🎴 {t.repos.length}
                  </span>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
