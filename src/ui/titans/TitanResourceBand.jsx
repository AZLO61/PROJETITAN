import React from "react";
import { CARD_LABEL, CARD_FORCE } from "../../domain/cards.js";
import { TITAN_COLORS } from "./constants.js";
import { TitanIcon } from "./TitanVisuals.jsx";
import BlockIcon from "../BlockIcon.jsx";
import { baremeHint } from "../blockNames.js";
import { T, marquee, readout, label } from "../theme.js";
import Icon from "../icons.jsx";

/* ============================================================
   LA RANGÉE DE JOUEURS — LE HUD DE LA BORNE
   ============================================================
   Quatre plaques, une par Titan, comme les quatre encarts « 1P / 2P » du
   haut d'un écran d'arcade.

   TROIS CHOSES ONT CHANGÉ, ET CHACUNE RÉPOND À UNE FRICTION SIGNALÉE :

   1. UNE SEULE PLAQUE EST EN RELIEF. Celle du Titan dont c'est le tour se
      lève hors de la rangée, ombre portée comprise ; les trois autres
      reculent. C'est le seul mouvement orchestré de l'écran, et c'est ce qui
      permet de savoir à qui est le tour sans lire un mot.

   2. LES PISTES SE COMPARENT. Bagarre et Destruction n'ont pas de maximum
      connu : une jauge « x sur 20 » ne voudrait rien dire. Chaque barre est
      donc tracée PAR RAPPORT AU MEILLEUR DE LA TABLE, et le chiffre reste
      lisible à côté. « Se situer par rapport aux autres » se lit alors d'un
      coup d'œil, ce que quatre nombres empilés ne permettaient pas.

   3. PLUS D'ÉMOJIS. 💪 et 💥 se ressemblaient à 11 px, et 💉 ne prenait
      jamais la couleur de son signal. Icônes dessinées, une seule graisse.

   L'animation `titanPulse` reste retirée : une pulsation infinie pendant une
   partie d'1h30 fatigue l'œil et vide la batterie d'une tablette.
============================================================ */

const COULEURS_REPAIRE = ["bleu", "rose", "orange", "rouge", "vert"];

/* Une piste de score, comparée au meilleur de la table. */
function Piste({ icone, nom, valeur, meilleur, couleur }) {
  const pct = meilleur > 0 ? Math.round((valeur / meilleur) * 100) : 0;
  return (
    <div
      title={`Piste ADN ${nom} : ${valeur} point${valeur > 1 ? "s" : ""}${
        meilleur > 0 && valeur < meilleur ? ` — le meilleur de la table en a ${meilleur}` : ""
      }${meilleur > 0 && valeur === meilleur ? " — meilleur de la table" : ""}`}
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "help" }}
    >
      <Icon name={icone} size={15} style={{ color: couleur }} />
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          minWidth: 18,
          height: 7,
          background: "rgba(0,0,0,.45)",
          border: `1px solid ${T.edge}`,
          overflow: "hidden",
        }}
      >
        {/* La barre se remplit par `transform`, jamais par `width` : animer
            une propriété de mise en page fait recalculer le flux à chaque
            image, et il y a huit de ces barres à l'écran. */}
        <span
          style={{
            display: "block",
            height: "100%",
            width: "100%",
            transformOrigin: "left center",
            transform: `scaleX(${pct / 100})`,
            background: couleur,
            transition: `transform 320ms ${T.easeOut}`,
          }}
        />
      </span>
      <span style={{ ...readout("0.62rem", valeur > 0 ? T.text : T.faint), minWidth: 16, textAlign: "right" }}>
        {valeur}
      </span>
    </div>
  );
}

export default function TitanResourceBand({
  titans, selectedTitanId, onSelect, activePlayerId, phase, titanDisplayName,
  titanModes = {}, titanProfiles = {}, profilsReveles = {}, revelerProfil, profileLabel,
  waitingNextTitan = false, titansEnAttente = [], rainbowWinnerId = null,
  phaseValidated = {}, ordreInitiative = [], detonateurId = null,
  validatePhase, canValidatePhase, getPhaseBlockReason,
}) {
  /* SURVOL : LA SÉLECTION DÉCIDE, PAS LE TOUR EN COURS.
     Remonté SIX fois par Nikola (dernier repère : 2026-08-18) : « je veux
     que si j'hover mes rectangles pleins jaunes de MON TITAN, même si c'est
     pas mon tour, je puisse savoir il me reste quoi à jouer. »

     Le vrai signal de confiance n'est pas le tour officiel, c'est la
     SÉLECTION : c'est déjà comme ça que la Phase Programmation traite le
     secret. On applique la même règle en Phase Action. */
  const estSonTour = (id) => selectedTitanId === id;
  const enAttenteIds = new Set((titansEnAttente || []).map((x) => x.id));
  const colorCount = (titan) => {
    const c = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
    titan.repaire.forEach((x) => { if (c[x] !== undefined) c[x]++; });
    return c;
  };

  // Le meilleur de la table, pour que chaque barre se lise comme une
  // comparaison et pas comme une valeur absolue sans échelle.
  const maxBagarre = Math.max(1, ...titans.map((t) => t.bagarre || 0));
  const maxDestruction = Math.max(1, ...titans.map((t) => t.destruction || 0));

  // Easter-egg demandé par Nikola : 10 clics sur l'encart d'un Titan IA
  // dévoilent son profil. Le compteur vit dans une ref : un state
  // re-rendrait toute la bande à chaque clic sans rien changer à l'affichage
  // tant que le seuil n'est pas atteint.
  const clicsRef = React.useRef({});
  const CLICS_POUR_REVELER = 10;
  const compterClic = (id) => {
    if (!revelerProfil || titanModes[id] !== "ia" || profilsReveles[id]) return;
    const n = (clicsRef.current[id] || 0) + 1;
    clicsRef.current[id] = n;
    if (n >= CLICS_POUR_REVELER) revelerProfil(id);
  };

  return (
    <div
      style={{
        display: "grid",
        /* 160 et pas 190 : à 190, une tablette de 820 px n'en tenait que
           trois par rangée et le quatrième Titan se retrouvait seul sur une
           ligne, deux fois plus large que ses adversaires. Les quatre
           plaques doivent rester comparables entre elles — c'est toute leur
           fonction. */
        gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
        gap: T.s2,
        marginBottom: T.s4,
        // La plaque active se lève : la rangée réserve la place au-dessus,
        // sinon elle pousse ce qui la précède à chaque changement de tour.
        paddingTop: 4,
      }}
    >
      {titans.map((t) => {
        const tc = TITAN_COLORS[t.id] || TITAN_COLORS[1];
        const isSelected = selectedTitanId === t.id;
        const isActive = activePlayerId === t.id && phase === "action";
        const counts = colorCount(t);
        const soclesTotal = (t.socles || []).reduce((s, v) => s + v, 0);
        const estMoi = estSonTour(t.id);
        const estIA = titanModes[t.id] === "ia";

        return (
          <div
            key={t.id}
            onClick={() => { compterClic(t.id); onSelect(t.id); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); }
            }}
            aria-current={isActive ? "true" : undefined}
            aria-label={`${titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`}${isActive ? ", à lui de jouer" : ""}`}
            style={{
              position: "relative",
              minWidth: 0,
              cursor: "pointer",
              background: T.plate,
              /* Le cerne porte TOUJOURS la couleur du Titan : un liseré jaune
                 sur le cas « sélectionné + actif » faisait croire que le
                 Titan avait changé de couleur. */
              border: `${T.edgeW} solid ${isSelected || isActive ? tc.accent : T.edge}`,
              borderRadius: T.rPlate,
              padding: `${T.s2} 10px 10px`,
              /* LE SEUL ÉLÉMENT EN RELIEF DE L'ÉCRAN. */
              boxShadow: isActive
                ? `0 5px 0 -1px ${T.edge}, 0 10px 20px rgba(0,0,0,.5)`
                : isSelected
                  ? `0 0 0 1px ${tc.accent}55`
                  : "none",
              transform: isActive ? "translateY(-4px)" : "none",
              opacity: isActive || isSelected ? 1 : 0.82,
              transition: `transform 260ms ${T.easeOut}, box-shadow 260ms ${T.easeOut}, opacity 200ms linear, border-color 160ms linear`,
            }}
          >
            {/* Le liseré de couleur en tête de plaque : c'est le repère de
                joueur, celui qu'on cherche des yeux de loin. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                insetInline: -2,
                top: -2,
                height: 4,
                background: tc.accent,
                borderRadius: `${T.rPlate} ${T.rPlate} 0 0`,
              }}
            />

            {/* ── Identité ── */}
            <div style={{ display: "flex", alignItems: "center", gap: T.s2, marginTop: 6, marginBottom: T.s2 }}>
              <TitanIcon titanId={t.id} size={30} variant="plain" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    ...marquee("0.92rem", tc.accent),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  {/* HORS DE BIG CITY — remplace un panneau entier.
                      Nikola le 2026-08-17 : « une petite icône sur l'encart du
                      Titan, c'est suffisant ». L'information utile — qui est
                      dehors et par où il rentre — tient dans l'infobulle. */}
                  {enAttenteIds.has(t.id) && (
                    <span
                      title={`Hors de BIG CITY — ${titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`} rentre par ${t.cell} au début de son tour, pas avant. Sa rentrée lui coûtera 1 case de Mouvement gratuit, et 1 de plus par obstacle à contourner.`}
                      style={{ cursor: "help", color: T.stop, display: "flex" }}
                      aria-label="Hors du ring"
                    >
                      <Icon name="ringout" size={13} />
                    </span>
                  )}
                  {detonateurId === t.id && (
                    <span
                      title="Détonateur : il ouvre chaque round de cette Manche, et tranche les choix de sens."
                      style={{ cursor: "help", color: T.warn, display: "flex" }}
                    >
                      <Icon name="detonator" size={13} />
                    </span>
                  )}
                  <span style={readout("0.6rem", T.faint)}>{t.cell}</span>
                </div>
              </div>
              {/* Adrénaline : la réserve qu'on dépense, donc à droite, là où
                  une borne met toujours ses crédits. */}
              <div
                title="Adrénaline disponible — chaque point dépensé allonge une portée ou pèse dans un duel"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  color: (t.adrenaline || 0) > 0 ? T.go : T.faint,
                  cursor: "help", flexShrink: 0,
                }}
              >
                <Icon name="adrenaline" size={14} />
                <span style={readout("0.78rem")}>{t.adrenaline || 0}</span>
              </div>
            </div>

            {/* ── Repaire : la ressource surveillée à chaque tour ── */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minHeight: 24 }}>
              {COULEURS_REPAIRE.map((c) =>
                counts[c] > 0 ? (
                  <div
                    key={c}
                    title={baremeHint(c, counts[c])}
                    style={{ display: "flex", alignItems: "center", gap: 3, cursor: "help" }}
                  >
                    <BlockIcon color={c} size={19} />
                    <span style={readout("0.62rem", T.text)}>{counts[c]}</span>
                  </div>
                ) : null
              )}
              {(t.socles || []).length > 0 && (
                /* COMBIEN DE SOCLES, PAS COMBIEN DE POINTS — Nikola,
                   2026-08-18. Le nombre décide du trophée Collectionneur et se
                   compare d'un coup d'œil ; la valeur ne sert qu'au décompte,
                   elle reste dans l'infobulle. */
                <div
                  title={`${t.socles.length} Socle(s) collecté(s) — valeurs : ${t.socles.join(" + ")} = ${soclesTotal} pts`}
                  style={{ display: "flex", alignItems: "center", gap: 3, cursor: "help", color: T.dim }}
                >
                  <Icon name="socle" size={17} />
                  <span style={readout("0.62rem", T.text)}>{t.socles.length}</span>
                </div>
              )}
              {t.repaire.length === 0 && (t.socles || []).length === 0 && (
                <span style={label(T.faint, "0.68rem")}>Repaire vide</span>
              )}
            </div>

            <hr style={{ height: 1, background: T.rule, border: "none", margin: `${T.s2} 0` }} />

            {/* ── Les deux pistes, comparées à la table ── */}
            <div style={{ display: "grid", gap: 5 }}>
              <Piste icone="brawl" nom="Bagarre" valeur={t.bagarre || 0} meilleur={maxBagarre} couleur={T.warn} />
              <Piste icone="wreck" nom="Destruction" valeur={t.destruction || 0} meilleur={maxDestruction} couleur={T.stop} />
            </div>

            {/* ── Ligne d'état : cartes, Repos, trophée, validation ── */}
            <div
              style={{
                display: "flex", gap: T.s2, flexWrap: "wrap", alignItems: "center",
                marginTop: T.s2, minHeight: 20,
              }}
            >
              {/* Cartes de la Manche : 3 rectangles, pleins au départ, qui se
                  vident à mesure qu'elles sont jouées. Seul le NOMBRE est
                  public, jamais lesquelles.

                  CE QUE LE SURVOL RÉVÈLE — arbitrage Nikola du 2026-08-17 :
                  · plein (encore à jouer) → le nom n'apparaît que sur SON
                    propre Titan, celui qui tient l'appareil ;
                  · vide (jouée) → nom ET Force, sur TOUS les Titans : une
                    carte résolue est publique, et sa Force sert à estimer une
                    Bagarre à venir.
                  Réserve assumée : une carte défaussée face cachée reste
                  anonyme, seul son rectangle passe en vide. */}
              {(() => {
                const joueesOuDefaussees = t.playedThisManche.length + (t.discardedHidden || []).length;
                const total = joueesOuDefaussees + t.programmed.length;
                if (total === 0) return null;
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
                    style={{ display: "inline-flex", gap: 3, alignItems: "center", cursor: "help" }}
                  >
                    {cases.map((c, i) => (
                      <span
                        key={i}
                        title={libelle(c)}
                        style={{
                          /* FORMAT CARTE, Nikola 2026-08-18 : « fais des
                             rectangles à la verticale, ça fera plus carte ».
                             `flexShrink: 0` reste indispensable, sans lui le
                             conteneur écrase la largeur sur une ligne chargée. */
                          width: 9, height: 12, flexShrink: 0, alignSelf: "center",
                          display: "inline-block", boxSizing: "border-box",
                          background: c.restante ? T.you : "transparent",
                          border: `1.5px solid ${T.you}`,
                          opacity: c.restante ? 1 : 0.45,
                        }}
                      />
                    ))}
                  </span>
                );
              })()}

              {(t.repos || []).length > 0 && (() => {
                /* Respecte faceUp : une carte volée en Phase Repos est
                   publique, une carte mise en Repos par Fatigue reste anonyme
                   POUR LES ADVERSAIRES. Nikola (2026-08-17) : « je peux
                   consulter mes cartes en Fatigue au survol de l'icône dans
                   mon encart. » Ce sont ses cartes, il subit la Fatigue. */
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.tele, cursor: "help" }}
                  >
                    <Icon name="lock" size={12} />
                    <span style={readout("0.6rem", T.tele)}>{t.repos.length}</span>
                  </span>
                );
              })()}

              {/* Trophée Arc-en-ciel — point 4.5 du 2026-08-19. Il était
                  annoncé UNE FOIS au journal puis n'apparaissait plus nulle
                  part : à la table, personne ne se souvient qui l'a pris trois
                  Manches plus tôt, alors que c'est 5 points définitifs. */}
              {rainbowWinnerId === t.id && (
                <span
                  title="Trophée Arc-en-ciel : premier à avoir possédé les 5 couleurs, +5 points au décompte final"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    border: `1px solid ${T.go}`, color: T.go,
                    padding: "1px 5px", cursor: "help",
                    ...label(T.go, "0.62rem"),
                  }}
                >
                  <Icon name="lantern" size={11} /> +5
                </span>
              )}

              {/* Profil de l'IA, seulement une fois dévoilé. */}
              {estIA && profilsReveles[t.id] && profileLabel && (
                <span
                  title="Profil de cette IA : sa force et son tempérament"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.tele, ...label(T.tele, "0.62rem") }}
                >
                  <Icon name="bot" size={12} /> {profileLabel(titanProfiles[t.id])}
                </span>
              )}

              {/* VALIDATION DE PHASE, RAPATRIÉE ICI (Nikola, 2026-08-19).
                  Elle vivait dans une barre supprimée depuis, loin des Titans
                  qu'elle concerne. La Phase Action n'en a pas : elle se valide
                  toute seule quand les 3 rounds sont joués. */}
              {phase !== "repos" && phase !== "action" && (
                phaseValidated[t.id] ? (
                  <span title="A validé sa phase" style={{ color: T.go, cursor: "help", display: "flex", marginLeft: "auto" }}>
                    <Icon name="check" size={14} />
                  </span>
                ) : isSelected && validatePhase ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); validatePhase(t.id); }}
                    disabled={canValidatePhase ? !canValidatePhase(t.id) : false}
                    title={getPhaseBlockReason ? getPhaseBlockReason(t.id) : ""}
                    style={{
                      marginLeft: "auto",
                      background: canValidatePhase && canValidatePhase(t.id) ? T.go : "rgba(255,250,238,.07)",
                      color: canValidatePhase && canValidatePhase(t.id) ? "#00311e" : T.faint,
                      border: `2px solid ${T.edge}`,
                      padding: "3px 9px",
                      cursor: canValidatePhase && canValidatePhase(t.id) ? "pointer" : "not-allowed",
                      ...label(
                        canValidatePhase && canValidatePhase(t.id) ? "#00311e" : T.faint,
                        "0.62rem"
                      ),
                    }}
                  >
                    Valider
                  </button>
                ) : (
                  <span title="N'a pas encore validé sa phase" style={{ marginLeft: "auto", opacity: 0.4, color: T.faint, display: "flex" }}>
                    <Icon name="close" size={13} />
                  </span>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
