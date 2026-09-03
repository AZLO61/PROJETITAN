import React from "react";
import { TITAN_COLORS } from "./constants.js";
import { TITAN_SPRITE_KEY, SPRITE_DATA } from "../board3d/constants.js";

/* ── UNE IMAGE QUI NE CHARGE PAS NE LAISSE PAS UN TROU ──
   Nikola, 2026-09-01 : « les invités n'avaient pas les icônes dans le jeu ».

   Les portraits sont des PNG servis à côté de l'application. Un invité les
   charge donc sur SA connexion, souvent un téléphone en 4G, et une seule
   requête tombée laisse un `<img>` vide — définitivement : le navigateur ne
   retente jamais de lui-même, et l'icône reste blanche pour toute la partie.
   L'hôte, lui, les a déjà en cache et ne voit rien du problème.

   Deux filets, dans cet ordre. On RETENTE une fois, avec un paramètre qui
   contourne le cache d'échec du navigateur — un incident réseau ponctuel se
   répare alors tout seul. Si la seconde tentative échoue aussi, on dessine la
   PREMIÈRE LETTRE de l'animal dans la couleur du Titan : ce n'est pas le
   portrait, mais ça reste un repère différent pour chacun, ce qui est la seule
   chose que cette icône doit garantir.

   Même principe que `BlockIcon`, qui bascule déjà sur une pastille de couleur
   quand son PNG manque. */
function useSpriteAvecRepli(key) {
  const src = SPRITE_DATA[key];
  const [essai, setEssai] = React.useState(0); // 0 = normal, 1 = seconde chance, 2 = abandon
  // Un changement de Titan repart d'une image neuve : sans ça, une icône
  // réutilisée par React garderait l'échec de la précédente.
  React.useEffect(() => { setEssai(0); }, [key]);
  return {
    src: essai === 1 ? `${src}?r=1` : src,
    echoue: essai >= 2,
    onError: () => setEssai((n) => Math.min(2, n + 1)),
  };
}

function LettreDeRepli({ nom, couleur, taille }) {
  return (
    <span
      aria-hidden="true"
      style={{
        fontFamily: "'Bowlby One', sans-serif",
        fontSize: Math.max(9, Math.round(taille * 0.5)),
        lineHeight: 1,
        color: couleur || "rgba(255,255,255,.75)",
        userSelect: "none",
      }}
    >
      {(nom[0] || "?").toUpperCase()}
    </span>
  );
}

export function TitanIcon({ titanId, size = 28, variant = "gradient" }) {
  const key = TITAN_SPRITE_KEY[titanId] || "escargot";
  const sprite = useSpriteAvecRepli(key);
  const tc = TITAN_COLORS[titanId];
  // variant="border" : panneau de configuration — contour de la couleur du
  // Titan sur fond neutre, plutôt qu'un aplat en dégradé (demande explicite).
  const isBorder = variant === "border";
  // variant="plain" : le sprite seul, sans aplat de couleur ni contour.
  // Le carre colore derriere l'icone alourdissait les cartes de Titan.
  const isPlain = variant === "plain";
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: isPlain ? "transparent" : isBorder ? "rgba(255,255,255,.06)" : (tc?.gradient || "rgba(255,255,255,.1)"),
      border: isBorder ? `2px solid ${tc?.accent || "rgba(255,255,255,.4)"}` : "none",
      boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      {sprite.echoue ? (
        <LettreDeRepli nom={key} couleur={isPlain || isBorder ? (tc?.accent || null) : "#fff"} taille={size} />
      ) : (
        <img src={sprite.src} alt={key} onError={sprite.onError} style={{ maxWidth: "88%", maxHeight: "88%", width: "auto", height: "auto", objectFit: "contain", display: "block", filter: "brightness(1.2) drop-shadow(0 1px 2px rgba(0,0,0,.6))" }} />
      )}
    </div>
  );
}

export function TitanBadge({ titanId }) {
  const key = TITAN_SPRITE_KEY[titanId] || "escargot";
  const sprite = useSpriteAvecRepli(key);
  const tc = TITAN_COLORS[titanId];
  // Le sprite occupait toute la case et recouvrait les blocs posés au sol :
  // on ne voyait plus ce qu'il y avait sous le Titan. Il est réduit et calé
  // en haut, pour laisser le bas de la case aux débris.
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex",
      alignItems: "flex-start", justifyContent: "center",
      borderRadius: 6, overflow: "hidden", pointerEvents: "none",
    }}>
      {sprite.echoue ? (
        <LettreDeRepli nom={key} couleur={tc?.accent || "#fff"} taille={26} />
      ) : (
        <img src={sprite.src} alt={key} onError={sprite.onError} style={{
          maxWidth: "78%", maxHeight: "78%", width: "auto", height: "auto",
          objectFit: "contain", display: "block", imageRendering: "auto",
          filter: "brightness(1.2) drop-shadow(0 1px 3px rgba(0,0,0,.8))",
        }} />
      )}
    </div>
  );
}
