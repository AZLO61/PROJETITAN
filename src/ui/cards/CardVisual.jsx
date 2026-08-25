import React from "react";
import { T, marquee, readout, label } from "../theme.js";
import Icon, { CARD_ICON } from "../icons.jsx";

/* Les six couleurs de cartes sont des données de jeu, pas un choix
   décoratif : ce sont elles qu'on cherche des yeux dans une main. Elles ne
   bougent pas. Ce qui change ici, c'est la matière — l'aplat franc cerné de
   la borne, à la place du dégradé translucide. */
const CARD_CONFIG = {
  tout_casser: { label: "Tout Casser", force: 1, color: "#FF6B1A" },
  tete_en_avant: { label: "Tête en Avant", force: 2, color: "#9333EA" },
  graouhhh: { label: "Graouhhh", force: 2, color: "#2DD4BF" },
  boing_boing: { label: "Boing Boing", force: 2, color: "#FFD93D" },
  faut_pas_me_chauffer: { label: "Faut Pas Me Chauffer", force: 3, color: "#F44336" },
  je_ne_partage_pas: { label: "Je Ne Partage Pas", force: 3, color: "#2D8DF5" },
};

/* ── LA CARTE ──────────────────────────────────────────────
   Une carte d'arcade se lit à trois niveaux, dans cet ordre : sa couleur
   (repérage), son pictogramme (ce qu'elle fait), son nom (confirmation). Le
   nom passait avant tout le reste et occupait deux lignes sur trois ; il
   descend en pied, où il confirme au lieu d'annoncer.

   La Force n'est plus « ⚡ F2 » posé en petit : c'est le chiffre de
   l'afficheur, en haut à droite, à la place où une borne met toujours son
   compteur. */
export default function CardVisual({
  cardId,
  selected,
  selectable,
  played,
  inRepos,
  onClick,
  size = "normal",
  accentColor,
}) {
  const cfg = CARD_CONFIG[cardId];
  if (!cfg) return null;

  const isSmall = size === "small";
  const w = isSmall ? 84 : 112;
  const h = isSmall ? 112 : 150;
  const indisponible = played || inRepos;
  const cliquable = selectable !== false && !played;

  /* La bordure de sélection prend la couleur du TITAN qui joue, pas un vert
     fixe : c'est ce qui dit « c'est TA carte » quand l'appareil circule
     autour de la table. */
  const selColor = accentColor || T.you;

  return (
    <div
      onClick={cliquable ? onClick : undefined}
      role={cliquable ? "button" : undefined}
      tabIndex={cliquable ? 0 : undefined}
      onKeyDown={
        cliquable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={`${cfg.label}, Force ${cfg.force}${played ? ", déjà jouée" : inRepos ? ", en Zone Repos" : ""}`}
      aria-pressed={cliquable ? Boolean(selected) : undefined}
      title={`${cfg.label} — Force ${cfg.force}${played ? " (jouée)" : inRepos ? " (Repos)" : ""}`}
      style={{
        position: "relative",
        width: w,
        height: h,
        flexShrink: 0,
        cursor: cliquable ? "pointer" : "default",
        /* Aplat franc dans la couleur de la carte, assombri : la couleur
           reste identifiable sans que le texte blanc devienne illisible
           dessus. Aucun dégradé. */
        background: indisponible ? "rgba(255,250,238,.05)" : `color-mix(in srgb, ${cfg.color} 26%, ${T.screen})`,
        border: `${T.edgeW} solid ${selected ? selColor : indisponible ? T.rule : T.edge}`,
        borderRadius: T.rChip,
        boxShadow: selected
          ? `0 0 0 3px ${selColor}, 0 6px 0 -1px ${T.edge}, 0 12px 24px rgba(0,0,0,.5)`
          : cliquable
            ? `0 3px 0 ${T.edge}`
            : "none",
        transform: selected ? "translateY(-3px)" : "none",
        transition: `transform 140ms ${T.easeSnap}, box-shadow 140ms ${T.easeOut}, border-color 140ms linear`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        opacity: indisponible ? 0.5 : 1,
      }}
    >
      {/* Bandeau de couleur : la carte se repère à ça, de loin. */}
      <div
        style={{
          height: 6,
          background: cfg.color,
          flexShrink: 0,
        }}
      />

      {/* Force, dans le coin de l'afficheur. */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 8,
          ...readout(isSmall ? "0.7rem" : "0.85rem", cfg.color),
        }}
      >
        {cfg.force}
      </div>

      {/* Le pictogramme, au centre et en grand : c'est lui qui dit ce que la
          carte FAIT. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: cfg.color,
        }}
      >
        <Icon name={CARD_ICON[cardId]} size={isSmall ? 34 : 46} strokeWidth={2} />
      </div>

      {/* Le nom, en pied : il confirme, il n'annonce plus. */}
      <div
        style={{
          ...marquee(isSmall ? "0.6rem" : "0.72rem", T.text),
          padding: "0 6px 8px",
          textAlign: "center",
          lineHeight: 1.15,
          hyphens: "auto",
        }}
      >
        {cfg.label}
      </div>

      {/* Un état indisponible se dit en toutes lettres, en travers, comme un
          tampon — pas par une simple opacité qu'on peut prendre pour un bug
          d'affichage. */}
      {indisponible && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(12,8,32,.55)",
          }}
        >
          <span
            style={{
              ...label(played ? T.faint : T.you, T.micro),
              transform: "rotate(-11deg)",
              border: `2px solid ${played ? T.faint : T.you}`,
              padding: "3px 8px",
              background: "rgba(12,8,32,.8)",
            }}
          >
            {played ? "Jouée" : "Repos"}
          </span>
        </div>
      )}
    </div>
  );
}
