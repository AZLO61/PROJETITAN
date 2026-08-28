import React from "react";
import { T, marquee } from "../theme.js";
import { CARD_LABEL } from "../../domain/index.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import CardVisual from "../cards/CardVisual.jsx";

/* ── REFUSER UNE FATIGUE ───────────────────────────────────
   Ruling du 2026-08-28 : « l'Adrénaline permet de refuser une Fatigue. »

   La carte est DÉJÀ partie en Zone Repos quand ce bandeau s'affiche, et c'est
   voulu : elle est tirée au sort, donc refuser sans savoir laquelle on perd ne
   serait pas un choix mais un pari. On montre donc la carte, puis on demande.

   Une décision bloquante de plus, avec le traitement des autres — mais en
   violet du téléporteur plutôt qu'en rouge : ce n'est pas une agression qu'on
   subit, c'est une porte de sortie qu'on nous offre. */
export default function FatigueBanner({ vm }) {
  const { fatigueEnAttente, titanState, titanDisplayName, refuserFatigueEnCours, accepterFatigueEnCours } = vm;
  if (!fatigueEnAttente) return null;

  const { attackerId, targetId, cardId } = fatigueEnAttente;
  const cible = titanState.players.find((t) => t.id === targetId);
  const stock = cible?.adrenaline || 0;

  return (
    <div style={{
      background: "rgba(168,85,247,.16)",
      border: `2.5px solid ${T.tele}`,
      boxShadow: `0 0 0 3px rgba(168,85,247,.3), 0 4px 18px rgba(168,85,247,.3)`,
      borderRadius: 12, padding: "9px 13px", marginBottom: 9, fontSize: ".85rem",
    }}>
      <div style={{
        ...marquee(".92rem", T.tele),
        marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        <span aria-hidden="true">😮‍💨</span>
        Fatigue — <TitanIcon titanId={attackerId} size={17} variant="plain" />
        <span style={{ opacity: .7 }}>sur</span>
        <TitanIcon titanId={targetId} size={17} variant="plain" />
        {titanDisplayName(targetId)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <CardVisual cardId={cardId} size="small" />
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ margin: "0 0 7px", color: "rgba(255,255,255,.85)", fontSize: ".8rem" }}>
            {CARD_LABEL[cardId]} vient de partir en Zone Repos. Tu peux la reprendre
            en donnant 1 Adrénaline à l'attaquant.
          </p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button
              onClick={refuserFatigueEnCours}
              disabled={stock < 1}
              title={stock < 1 ? "Aucune Adrénaline à dépenser" : "Reprendre la carte contre 1 Adrénaline"}
              style={{
                background: stock >= 1 ? "rgba(134,255,113,.15)" : "rgba(255,255,255,.06)",
                border: `2px solid ${stock >= 1 ? "#86ff71" : T.rule}`,
                borderRadius: T.rChip,
                color: stock >= 1 ? "#86ff71" : T.faint,
                padding: "7px 14px", fontWeight: 700,
                cursor: stock >= 1 ? "pointer" : "not-allowed",
              }}
            >
              💉 Payer 1 ({stock}) → reprendre la carte
            </button>
            <button
              onClick={accepterFatigueEnCours}
              style={{
                background: "none", border: `1.5px solid ${T.rule}`, borderRadius: T.rChip,
                color: T.dim, padding: "7px 14px", cursor: "pointer",
              }}
            >
              Encaisser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
