import React from "react";
import { COULEURS, COLOR_HEX, STOCK_INITIAL } from "../../domain/gameRules.js";
import { CARD_LABEL } from "../../domain/cards.js";
import { TITAN_COLORS } from "./constants.js";
import { TitanIcon } from "./TitanVisuals.jsx";
// ============================================================
export default function TitanResourceBand({ titans, selectedTitanId, onSelect, activePlayerId, phase, titanDisplayName }) {
  const colorCount = (titan) => {
    const c = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
    titan.repaire.forEach((x) => { if (c[x] !== undefined) c[x]++; });
    return c;
  };

  return (
    <div style={{
      display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap",
    }}>
      {titans.map((t) => {
        const tc = TITAN_COLORS[t.id] || TITAN_COLORS[1];
        const isSelected = selectedTitanId === t.id;
        const isActive = activePlayerId === t.id && phase === "action";
        const counts = colorCount(t);
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              flex: "1 1 150px", borderRadius: 12, cursor: "pointer",
              border: isSelected && isActive
                ? `2.5px solid #FFD93D`
                : isSelected
                ? `2px solid ${tc.accent}`
                : isActive
                ? `2.5px solid ${tc.accent}`
                : "1.5px solid rgba(255,255,255,.1)",
              padding: "8px 10px",
              background: isActive
                ? `linear-gradient(135deg, ${tc.accent}22 0%, rgba(255,255,255,.04) 100%)`
                : isSelected ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
              boxShadow: isActive
                ? `0 0 0 3px ${tc.accent}44, 0 0 22px ${tc.accent}66`
                : "none",
              transform: isActive ? "scale(1.04)" : "scale(1)",
              animation: isActive ? "titanPulse 1.4s ease-in-out infinite" : "none",
              transition: "all .2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <TitanIcon titanId={t.id} size={22} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".68rem", fontFamily: "'Bowlby One', sans-serif", color: tc.accent }}>
                  {titanDisplayName ? titanDisplayName(t.id) : `Titan ${t.id}`} {isActive ? "▶" : ""}
                </div>
                <div style={{ fontSize: ".58rem", color: "rgba(255,255,255,.5)" }}>{t.cell}</div>
              </div>
              <div style={{
                fontSize: ".6rem", fontWeight: 700,
                color: "#86ff71", whiteSpace: "nowrap",
              }}>
                💉 ×{t.adrenaline || 0}
              </div>
            </div>
            {/* Blocs par couleur */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
              {["bleu", "rose", "orange", "rouge", "vert"].map((c) =>
                counts[c] > 0 ? (
                  <div key={c} style={{
                    display: "flex", alignItems: "center", gap: 2,
                    background: `${COLOR_HEX[c]}33`, borderRadius: 5,
                    padding: "2px 5px", fontSize: ".6rem", fontWeight: 700,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: COLOR_HEX[c] }} />
                    <span style={{ color: "#fff" }}>{counts[c]}</span>
                  </div>
                ) : null
              )}
              {t.repaire.length === 0 && (
                <span style={{ fontSize: ".58rem", color: "rgba(255,255,255,.3)" }}>Repaire vide</span>
              )}
            </div>
            {/* Socles + Pistes ADN */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: ".58rem", color: "rgba(255,255,255,.55)" }}>
              <span title={(t.socles || []).length ? `Détail : ${(t.socles || []).join(" + ")}` : "Aucun socle collecté"}>
                🧱 Socles: {(t.socles || []).reduce((s, v) => s + v, 0)} pts
                {(t.socles || []).length > 0 && (
                  <span style={{ color: "rgba(255,255,255,.35)" }}> ({(t.socles || []).length})</span>
                )}
              </span>
              <span>💪 {t.bagarre || 0}</span>
              <span>💥 {t.destruction || 0}</span>
              {/* Zone Repos — bug remonté "carte enlevée en phase repos pas
                  toujours consultable" : avant, cette info n'apparaissait
                  que dans le panneau détaillé du Titan sélectionné. Elle
                  est maintenant toujours visible ici, quel que soit le
                  Titan sélectionné, avec le détail des cartes au survol. */}
              {(t.repos || []).length > 0 && (
                <span
                  title={`En Zone Repos (indisponible jusqu'à la Manche suivante) : ${t.repos.map((e) => CARD_LABEL[e.cardId]).join(", ")}`}
                  style={{ color: "#ff8fa3", fontWeight: 700, cursor: "help" }}
                >
                  🎴 Repos: {t.repos.length}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// BANDEAU STOCK BLOCS SUR LE PLATEAU
