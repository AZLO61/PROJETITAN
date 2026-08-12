import React from "react";
import { COULEURS, COLOR_HEX, STOCK_INITIAL } from "../../domain/gameRules.js";
// ============================================================
export default function BlockStockBar({ board, looseBlocks }) {
  const onBoard = { bleu: 0, rose: 0, orange: 0, rouge: 0 };
  Object.values(board).forEach((b) => b.blocks.forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; }));
  Object.values(looseBlocks).forEach((stack) =>
    (stack || []).forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; })
  );
  const activeTele = Object.values(board).filter((b) => b.isTeleporter && b.blocks.length > 0).length;
  const totalTele = Object.values(board).filter((b) => b.isTeleporter).length;

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "center", padding: "6px 10px",
      background: "rgba(0,0,0,.2)", borderRadius: 10, marginBottom: 10,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: ".62rem", color: "rgba(255,255,255,.5)", marginRight: 2 }}>Stock :</span>
      {/* Téléporteurs actifs */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: activeTele <= 1 ? "rgba(239,68,68,.15)" : "rgba(34,197,94,.1)",
        border: `1px solid ${activeTele <= 1 ? "rgba(239,68,68,.4)" : "rgba(34,197,94,.3)"}`,
        borderRadius: 8, padding: "3px 8px",
      }}>
        <span style={{ fontSize: "11px" }}>🌀</span>
        <span style={{
          fontSize: ".68rem", fontWeight: 700,
          color: activeTele <= 1 ? "#ef4444" : "#22C55E",
        }}>
          Téléporteur {activeTele}/{totalTele}
        </span>
        <div style={{ width: 32, height: 6, borderRadius: 3, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
          <div style={{
            width: `${totalTele > 0 ? (activeTele / totalTele) * 100 : 0}%`, height: "100%",
            background: activeTele <= 1 ? "#ef4444" : "#22C55E",
            transition: "width .3s",
          }} />
        </div>
      </div>
      {["bleu", "rose", "orange", "rouge"].map((c) => {
        const total = STOCK_INITIAL[c];
        const remaining = onBoard[c];
        const pct = remaining / total;
        const warn = pct < 0.25;
        return (
          <div key={c} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: ".56rem", color: "rgba(255,255,255,.5)" }}>{remaining}/{total}</div>
            <div style={{
              width: 28, height: 8, borderRadius: 4,
              background: "rgba(255,255,255,.1)",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${pct * 100}%`, height: "100%",
                background: warn ? "#ef4444" : COLOR_HEX[c],
                transition: "width .3s",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
