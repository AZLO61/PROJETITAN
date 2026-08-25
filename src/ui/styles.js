/* ============================================================
   PROJET TITAN — LES TROIS FABRIQUES DE BOUTONS HISTORIQUES
   ============================================================
   Elles gardent leurs signatures : elles sont appelées depuis une vingtaine
   d'endroits, et chacun de ces appels porte un CHOIX DE COULEUR déjà juste
   (le jaune du tour, le vert de la validation, le rouge d'une décision qui
   bloque). Ce choix-là, on le garde.

   Ce qui change, c'est la matière. Le dégradé à 135° laisse la place à
   l'aplat franc cerné de noir de la borne, avec l'épaisseur de capuchon
   sous la touche. Une seule couleur par bouton : un dégradé sur un bouton de
   14 px de haut ne se voit pas, il salit juste la couleur.

   Les nouveaux composants passent par `key()` de `theme.js` ; ces trois-ci
   existent pour que le reste de l'application hérite du monde sans être
   réécrit ligne à ligne.
============================================================ */
import { T, versHex } from "./theme.js";

/* Une couleur d'aplat clair demande une encre sombre, et l'inverse. Le
   calcul est fait sur la luminance perçue, pas sur la moyenne des canaux :
   le jaune #FFD93D et le bleu #2D8DF5 ont des moyennes proches et des
   luminances qui n'ont rien à voir. */
function encrePour(couleur) {
  /* BUG DU BOUTON JAUNE À ÉCRITURE BLANCHE (Nikola).
     Les appelants passent des jetons — `T.you` vaut `"var(--sig-you)"` — et
     cette fonction ne lisait que les `#rrggbb`. Toute couleur en `var(…)`
     tombait donc dans le repli blanc, quelle que soit sa luminance : sur le
     jaune, texte blanc sur fond clair, illisible. Le défaut valait pour
     TOUTES les touches colorées, il ne se voyait juste que sur celle-là. */
  const hex = versHex(couleur);
  if (!hex || typeof hex !== "string" || hex[0] !== "#") return T.text;
  const h = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? "#120d02" : "#fffaee";
}

const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontFamily: T.ui,
  fontWeight: 700,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  borderRadius: T.rChip,
  transition: `transform 90ms ${T.easeOut}, box-shadow 90ms ${T.easeOut}, background 140ms linear`,
};

export function btnStyle(c1, c2, active = true) {
  const face = active && c1 ? c1 : "rgba(255,250,238,.10)";
  return {
    ...base,
    background: face,
    color: active && c1 ? encrePour(c1) : T.text,
    border: `${T.edgeW} solid ${T.edge}`,
    padding: "10px 14px",
    fontSize: T.small,
    cursor: "pointer",
    boxShadow: active && c1 ? `0 3px 0 ${T.edge}` : "none",
  };
}

export function smallBtn(enabled, c1) {
  return {
    ...base,
    background: enabled && c1 ? c1 : "rgba(255,250,238,.06)",
    color: enabled && c1 ? encrePour(c1) : T.faint,
    border: `${T.edgeW} solid ${T.edge}`,
    padding: "8px 13px",
    fontSize: T.micro,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: enabled && c1 ? `0 3px 0 ${T.edge}` : "none",
    opacity: enabled ? 1 : 0.55,
  };
}

export function cancelBtn() {
  return {
    ...base,
    background: "transparent",
    color: T.dim,
    border: `2px solid ${T.rule}`,
    padding: "7px 12px",
    fontSize: T.micro,
    cursor: "pointer",
    boxShadow: "none",
  };
}
