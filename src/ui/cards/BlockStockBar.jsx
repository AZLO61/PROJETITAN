import React from "react";
import { COLOR_HEX, STOCK_INITIAL } from "../../domain/gameRules.js";
import { BLOCK_NAME, BLOCK_ORDER } from "../blockNames.js";
import BlockIcon from "../BlockIcon.jsx";

// ============================================================
// ÉTAT DU PLATEAU — blocs restants et avancement de la partie
// ============================================================
// Trois panneaux disaient l'état du plateau : une barre de jauges en haut,
// une liste de chiffres dans les stats du bas, et un encart « Partie ».
// Tout est réuni ici, au-dessus du plateau.
//
// Le nom de chaque bloc n'est plus écrit : il tient dans l'infobulle, la
// couleur et l'icône suffisent à l'identifier en un coup d'œil. Écrire
// « Habitation », « Supermarché » sur cinq lignes remplissait le panneau
// d'un texte qu'on ne lit qu'une fois.
//
// L'icône de bloc est le composant partagé BlockIcon : même volume que dans
// la vue 3D, dans tous les panneaux.

function StockItem({ color, label, remaining, total, alert }) {
  const pct = total > 0 ? remaining / total : 0;
  return (
    <div
      title={`${label} — ${remaining} sur ${total}`}
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "help" }}
    >
      <BlockIcon color={color} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 42 }}>
        <span style={{
          fontSize: ".68rem", fontWeight: 700, lineHeight: 1,
          color: alert ? "#ef4444" : "rgba(255,255,255,.8)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {remaining}<span style={{ opacity: .45 }}>/{total}</span>
        </span>
        <div style={{
          width: 42, height: 5, borderRadius: 3,
          background: "rgba(255,255,255,.12)", overflow: "hidden",
        }}>
          <div style={{
            width: "100%", height: "100%",
            transform: `scaleX(${pct})`, transformOrigin: "left center",
            background: alert ? "#ef4444" : COLOR_HEX[color],
            transition: "transform .3s ease-out",
          }} />
        </div>
      </div>
    </div>
  );
}

export default function BlockStockBar({
  board, looseBlocks,
  mancheNumber, totalManches, detonateurName, occupiedCount, apocalypseThreshold,
}) {
  const onBoard = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
  Object.values(board).forEach((b) =>
    b.blocks.forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; })
  );
  Object.values(looseBlocks).forEach((stack) =>
    (stack || []).forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; })
  );
  const activeTele = Object.values(board).filter((b) => b.isTeleporter && b.blocks.length > 0).length;
  const totalTele = Object.values(board).filter((b) => b.isTeleporter).length;
  const apocalypseProche = occupiedCount != null && occupiedCount <= apocalypseThreshold;

  return (
    <div style={{
      background: "rgba(0,0,0,.22)", borderRadius: 10,
      padding: "8px 12px", marginBottom: 10,
    }}>
      {/* Ligne 1 — avancement de la partie */}
      {mancheNumber != null && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          fontSize: ".68rem", color: "rgba(255,255,255,.6)",
          paddingBottom: 7, marginBottom: 7,
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}>
          <span>
            Manche <strong style={{ color: "#FFD93D", fontVariantNumeric: "tabular-nums" }}>
              {mancheNumber}/{totalManches}
            </strong>
          </span>
          <span title="Titan qui ouvre la Manche">
            Détonateur <strong style={{ color: "#fffaee" }}>{detonateurName}</strong>
          </span>
          {occupiedCount != null && (
            <span
              title={`Fin de partie déclenchée à ${apocalypseThreshold} bâtiment(s) debout`}
              style={{ marginLeft: "auto", color: apocalypseProche ? "#ef4444" : "inherit", cursor: "help" }}
            >
              Bâtiments <strong style={{
                color: apocalypseProche ? "#ef4444" : "#fffaee",
                fontVariantNumeric: "tabular-nums",
              }}>
                {occupiedCount}/25
              </strong>
              <span style={{ opacity: .6 }}> · seuil {apocalypseThreshold}</span>
            </span>
          )}
        </div>
      )}

      {/* Ligne 2 — blocs restants sur le plateau */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {BLOCK_ORDER.map((c) => (
          <StockItem
            key={c}
            color={c}
            label={BLOCK_NAME[c]}
            remaining={onBoard[c]}
            total={STOCK_INITIAL[c]}
            alert={onBoard[c] === 0}
          />
        ))}
        <StockItem
          color="vert"
          label={`${BLOCK_NAME.vert} actifs`}
          remaining={activeTele}
          total={totalTele}
          alert={activeTele <= 1}
        />
      </div>
    </div>
  );
}
