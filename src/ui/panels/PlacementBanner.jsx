import React from "react";
import { T, marquee } from "../theme.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

/* ── LE PLACEMENT D'OUVERTURE ──────────────────────────────
   Nikola, 2026-08-28 : « le placement choisi par le joueur au début du jeu
   (inverse de l'initiative, Détonateur en dernier), on se place sur une des
   cases libres adjacentes à un angle. C'est un choix, ça ne doit pas être
   automatique, sauf pour une IA. »

   Le bandeau dit les trois choses qu'il faut pour choisir : à qui c'est,
   combien il en reste après, et POURQUOI l'ordre compte — poser tard est un
   avantage, et c'est la seule raison pour laquelle le Détonateur pose en
   dernier. Sans cette phrase, l'ordre ressemble à une formalité.

   Même traitement visuel que les autres décisions bloquantes (bordure
   épaisse, halo) : c'en est une, et la plus totale — rien d'autre ne se joue
   tant que les quatre Titans ne sont pas posés. */
export default function PlacementBanner({ vm }) {
  const { placementRestant, placementCells, titanState, titanModes, titanDisplayName } = vm;
  if (!placementRestant || placementRestant.length === 0) return null;

  const titanId = placementRestant[0];
  const estIa = titanModes && titanModes[titanId] === "ia";
  const restantApres = placementRestant.length - 1;
  const nom = titanDisplayName ? titanDisplayName(titanId) : `Titan ${titanId}`;
  const estDetonateur = titanState.detonateur === titanId;

  return (
    <div style={{
      background: "rgba(255,217,61,.16)",
      border: `2.5px solid ${T.you}`,
      boxShadow: `0 0 0 3px rgba(255,217,61,.35), 0 4px 18px rgba(255,217,61,.35)`,
      borderRadius: 12, padding: "9px 13px", marginBottom: 9, fontSize: ".85rem",
    }}>
      {/* Compacté le 2026-08-28 : « le panneau est trop gros, ça décale trop le
          plateau ». Le titre et la consigne tiennent sur deux lignes au lieu de
          quatre, et l'icône du Titan remplace la répétition de son nom. */}
      <div style={{
        ...marquee(".92rem", T.you),
        marginBottom: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        <span aria-hidden="true">📍</span>
        <TitanIcon titanId={titanId} size={17} />
        Mise en place — {nom} prend position
      </div>

      {/* Un <div> ici, pas un <p> : `TitanIcon` rend un <div>, et un bloc dans
          un paragraphe est du HTML invalide que le navigateur « répare » en
          fermant le paragraphe — la mise en page se défait alors toute seule. */}
      {/* CONSIGNE ET RAISON SUR LA MÊME LIGNE — Nikola, 2026-08-28. Deux
          paragraphes empilés pour deux phrases courtes coûtaient une ligne de
          plus à un écran qui doit tout montrer sans défiler, et rien ne les
          séparait vraiment : l'une dit quoi faire, l'autre pourquoi c'est à ce
          moment-là. Elles se lisent ensemble. */}
      <div style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {estIa ? (
          <span style={{ color: T.tele, fontWeight: 700 }}>
            🤖 {nom} est une IA — elle choisit elle-même…
          </span>
        ) : (
          <span>
            Clique une des <strong style={{ color: T.you }}>{placementCells.length} cases libres</strong> aux
            angles du plateau.
          </span>
        )}
        <span style={{ fontSize: ".7rem", color: T.dim, lineHeight: 1.4 }}>
          {estDetonateur
            ? "Détonateur, donc dernier à poser : il voit où sont tous les autres avant de se décider."
            : `Encore ${restantApres} à poser après lui — on pose dans l'inverse de l'initiative, plus on pose tard plus on en sait.`}
        </span>
      </div>
    </div>
  );
}
