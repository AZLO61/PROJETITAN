import React from "react";
import { T, marquee } from "../theme.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

/* ── TOUT CASSER, DANS L'ORDRE DU JOUEUR ───────────────────
   Nikola, 2026-08-28 : « en cas de TOUT CASSER, on projette les éléments 1 par 1
   dans l'ordre, mon choix. »

   La carte touche jusqu'à huit cases d'un coup, et l'ordre change le résultat :
   un bloc projeté sur une case qu'un Titan vient de quitter ne s'empile pas au
   même endroit, un débris posé avant ou après une poussée ne forme pas le même
   tas. C'était pourtant l'ordre du code qui décidait — bâtiments, puis blocs,
   puis Titans, puis Amas — et tout partait en une seconde.

   Ce bandeau ne fait que compter et nommer ce qui reste : le choix se fait sur
   le plateau, où les cibles sont surlignées en orange. Un clic, un élément, et
   le plateau se recalcule avant le suivant. */
const LIBELLE = {
  batiment: "Bâtiment",
  bloc: "Bloc au sol",
  amas: "Tas de débris",
  titan: "Titan",
};

export default function ToutCasserBanner({ vm }) {
  const { toutCasserFile, titanDisplayName } = vm;
  if (!toutCasserFile) return null;

  const { titanId, percussion, cibles } = toutCasserFile;

  return (
    <div style={{
      background: "rgba(251,146,60,.16)",
      border: `2.5px solid #fb923c`,
      boxShadow: "0 0 0 3px rgba(251,146,60,.3), 0 4px 18px rgba(251,146,60,.3)",
      borderRadius: 12, padding: "9px 13px", marginBottom: 9, fontSize: ".85rem",
    }}>
      <div style={{
        ...marquee(".92rem", "#ffb877"),
        marginBottom: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        <span aria-hidden="true">💥</span>
        <TitanIcon titanId={titanId} size={17} variant="plain" />
        Tout Casser — énergie {percussion.energie}
        {percussion.seuil4 && (
          <span style={{
            border: "1.5px solid #e32347", color: "#ff8fa3",
            fontSize: ".62rem", padding: "1px 5px", fontFamily: T.ui, letterSpacing: ".1em",
          }}>
            SEUIL 4
          </span>
        )}
      </div>

      <p style={{ margin: "0 0 6px", color: "rgba(255,255,255,.8)", fontSize: ".8rem" }}>
        Clique l'élément que tu projettes maintenant — <strong>{cibles.length} restant
        {cibles.length > 1 ? "s" : ""}</strong>. Le plateau se recalcule après chacun,
        donc l'ordre décide de ce que les projections rencontrent.
      </p>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {cibles.map((c) => (
          <span
            key={c.key}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "rgba(0,0,0,.24)", border: "1px solid rgba(251,146,60,.4)",
              borderRadius: 7, padding: "3px 8px", fontSize: ".74rem",
            }}
          >
            <strong style={{ color: "#ffb877" }}>{c.key}</strong>
            <span style={{ opacity: .7 }}>
              {c.nature === "titan" && c.targetId != null
                ? titanDisplayName(c.targetId)
                : LIBELLE[c.nature] ?? c.nature}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
