import React from "react";
import { T, marquee, readout } from "../theme.js";
import { cancelBtn } from "../styles.js";

/* ── UNE FEUILLE QUI SE POSE SUR LE MEUBLE ─────────────────
   Nikola, 2026-08-28 : « agrandis le plateau en réagençant les panneaux
   d'informations — l'historique des logs peut se mettre ailleurs, tout comme
   le panneau scoring, il peut s'ouvrir par-dessus le plateau ».

   Le décompte et le journal sont des panneaux de CONSULTATION : on les ouvre,
   on lit, on les referme. Montés dans le flux, ils prenaient en permanence la
   hauteur qu'ils occupent une fois ouverts, au détriment de la seule chose
   qu'on regarde pendant 1 h 30 — le plateau. Ils se posent donc PAR-DESSUS.

   La confirmation « Nouvelle partie » de HeaderPhase faisait déjà exactement
   ça, à la main. C'est cette boîte-là, extraite pour être partagée plutôt que
   recopiée une troisième fois.

   Ce n'est PAS le bon véhicule pour une décision bloquante (DIL, repli,
   écroulement) : celles-là doivent rester lisibles EN MÊME TEMPS que le
   plateau, puisqu'on y répond en regardant le plateau. Elles gardent leur
   bandeau sous l'en-tête. */
export default function Superposition({ titre, icone = null, onClose, largeur = 980, children, pied = null }) {
  // Échap ferme, et le fond ne défile plus derrière la feuille — même
  // traitement que la page Règles, pour que toutes les superpositions du jeu
  // se comportent pareil.
  React.useEffect(() => {
    const auClavier = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", auClavier);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", auClavier);
      document.body.style.overflow = avant;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9400,
        background: "rgba(12,8,32,.86)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "3vh 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.screen,
          border: `2px solid ${T.ruleStrong}`,
          borderRadius: T.rPlate,
          boxShadow: "0 18px 50px rgba(0,0,0,.7)",
          width: "100%", maxWidth: largeur,
          padding: "14px 16px 16px",
          boxSizing: "border-box",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          paddingBottom: T.s2, marginBottom: T.s3,
          borderBottom: `2px solid ${T.ruleStrong}`,
        }}>
          {icone}
          {/* Le titre peut porter un suffixe technique (« · graine 1913146969 ») :
              il se met à la taille d'un numéro, pas à celle d'un titre — c'est
              une référence à recopier, pas une chose à lire de loin. */}
          <h2 style={{ ...marquee(T.h3, T.you), flex: 1 }}>
            {titre.split(" · graine ")[0]}
            {titre.includes(" · graine ") && (
              <span style={{ ...readout("0.62rem", T.faint), marginLeft: 9, WebkitTextStroke: "0", letterSpacing: 0 }}>
                graine {titre.split(" · graine ")[1]}
              </span>
            )}
          </h2>
          {pied}
          <button onClick={onClose} style={cancelBtn()} title="Fermer (Échap)">
            ✕ Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
