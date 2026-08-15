import React from "react";
import { CARD_LABEL } from "../../domain/cards.js";
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
}) {
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
      gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
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
        const estMoi = activePlayerId === t.id;

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
                <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.5)" }}>{t.cell}</div>
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
                return (
                  <span
                    title={`${t.programmed.length} carte(s) encore à jouer sur ${total} cette Manche`}
                    style={{ display: "inline-flex", gap: 3, alignItems: "center", cursor: "help", marginLeft: "auto" }}
                  >
                    {/* Les cartes encore à jouer sont pleines, les autres
                        gardent leur contour jaune. Sur son propre Titan, le
                        survol d'un carré donne le nom de la carte : c'est son
                        jeu, il a le droit de le relire. */}
                    {[
                      ...t.programmed.map((cardId) => ({ cardId, restante: true })),
                      ...t.playedThisManche.map((cardId) => ({ cardId, restante: false, jouee: true })),
                      ...(t.discardedHidden || []).map(() => ({ cardId: null, restante: false })),
                    ].map((c, i) => (
                      <span
                        key={i}
                        title={
                          estMoi && c.cardId
                            ? `${CARD_LABEL[c.cardId]}${c.restante ? " — à jouer" : " — jouée"}`
                            : c.restante ? "Carte encore à jouer" : "Carte déjà passée"
                        }
                        style={{
                          width: 9, height: 9, borderRadius: 2, display: "inline-block",
                          background: c.restante ? "#FFD93D" : "transparent",
                          border: "1.5px solid #FFD93D",
                          cursor: estMoi && c.cardId ? "help" : "default",
                        }}
                      />
                    ))}
                  </span>
                );
              })()}
              {(t.repos || []).length > 0 && (() => {
                // Respecte faceUp : une carte volée en Phase Repos est publique,
                // une carte mise en Repos par Fatigue reste anonyme ici.
                const visibleNames = t.repos.filter((e) => e.faceUp).map((e) => CARD_LABEL[e.cardId]);
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
