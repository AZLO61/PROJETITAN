import React from "react";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

/* ============================================================
   LE TROPHÉE ARC-EN-CIEL SE VOIT ET S'ENTEND
   ============================================================
   Nikola, 2026-09-07 : « quand "arc en ciel" est atteint, faut une animation
   d'un arc-en-ciel au milieu de l'écran POUR TOUS, pour que ce soit bien
   visible, puis une petite musique mignonne de 3 secondes ».

   C'est le seul évènement de la partie qui se déclenche tout seul, sans que
   personne ne l'ait joué : il naît d'un ramassage ordinaire dès que la
   cinquième couleur entre au Repaire. Jusqu'ici il ne produisait qu'une ligne
   de journal, au milieu de dizaines d'autres — donc à la table, il passait
   inaperçu, et les +5 points de fin de partie tombaient sans que personne
   n'ait vu le moment où ils avaient été gagnés.

   POUR TOUS, ET SANS ARBITRE. On ne déclenche sur AUCUN évènement : on
   observe `rainbowWinnerId` passer de `null` à un identifiant. L'hôte le pose
   lui-même, un invité le reçoit dans l'instantané — les deux voient donc la
   même transition, sans qu'il faille câbler un message de plus dans le
   protocole.

   Une transition, jamais un état. La première valeur observée sert de
   référence : arriver en cours de partie sur un Trophée déjà décerné ne
   rejoue rien, et un « Annuler » qui le retire non plus.
============================================================ */

const ARC_COULEURS = ["#FF3B5C", "#FF9F1C", "#FFE156", "#16E08C", "#3BA9FF", "#A855F7"];
const DUREE_MS = 3000;

/* ── LA MUSIQUE EST SYNTHÉTISÉE, PAS EMBARQUÉE ──
   Un fichier audio serait une requête de plus pour les invités, sur la même
   connexion qui perd déjà des portraits de Titan (cf. `useSpriteAvecRepli`) :
   la « petite musique mignonne » arriverait donc au hasard du réseau, et
   souvent en retard sur son animation. Ces quelques oscillateurs pèsent zéro
   octet et partent exactement à l'image.

   Un arpège de Do majeur qui monte puis se referme sur sa tonique, en ondes
   triangulaires — le timbre le plus doux des quatre formes de base, sans
   l'agressivité du carré ni la mollesse du sinus. Enveloppes courtes, volume
   bas : ça doit charmer, pas couvrir la table. */
const NOTES = [
  { hz: 523.25, t: 0.00, d: 0.18 }, // do
  { hz: 659.25, t: 0.16, d: 0.18 }, // mi
  { hz: 783.99, t: 0.32, d: 0.18 }, // sol
  { hz: 1046.5, t: 0.48, d: 0.34 }, // do aigu
  { hz: 1318.5, t: 0.86, d: 0.24 }, // mi
  { hz: 1174.7, t: 1.10, d: 0.24 }, // ré
  { hz: 1046.5, t: 1.34, d: 0.90 }, // do, tenu
];

function jouerLeJingle() {
  /* Tout est enveloppé : un navigateur peut refuser le contexte audio (page
     jamais touchée, onglet en sourdine, politique d'autoplay), et une fête
     ratée ne doit jamais emporter la partie avec elle. */
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    // Un contexte créé avant le premier geste de l'utilisateur naît suspendu.
    // On le réveille sans attendre la promesse : si elle échoue, il n'y a
    // simplement pas de son, ce qui est déjà le cas sans cet appel.
    if (ctx.state === "suspended") ctx.resume?.().catch(() => {});
    const maitre = ctx.createGain();
    maitre.gain.value = 0.16; // discret : c'est une ponctuation, pas une fanfare
    maitre.connect(ctx.destination);

    const t0 = ctx.currentTime + 0.02;
    NOTES.forEach(({ hz, t, d }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = hz;
      // Attaque très courte puis extinction exponentielle : le grain d'une
      // boîte à musique, sans le clic d'un créneau brut.
      env.gain.setValueAtTime(0.0001, t0 + t);
      env.gain.exponentialRampToValueAtTime(1, t0 + t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d);
      osc.connect(env);
      env.connect(maitre);
      osc.start(t0 + t);
      osc.stop(t0 + t + d + 0.05);
    });
    return ctx;
  } catch {
    return null;
  }
}

export default function RainbowCelebration({ vm }) {
  const { rainbowWinnerId, titanDisplayName } = vm;
  const [fete, setFete] = React.useState(null); // null | titanId
  // La valeur au montage : elle sert de référence, pas de déclencheur.
  const vuRef = React.useRef(rainbowWinnerId);
  const audioRef = React.useRef(null);

  React.useEffect(() => {
    if (rainbowWinnerId === vuRef.current) return;
    const precedent = vuRef.current;
    vuRef.current = rainbowWinnerId;
    // On ne fête que l'ARRIVÉE du Trophée. Un « Annuler » qui le retire, ou
    // une nouvelle partie qui le remet à null, ne doit rien déclencher.
    if (rainbowWinnerId == null || precedent != null) return;

    setFete(rainbowWinnerId);
    audioRef.current = jouerLeJingle();
    const minuteur = setTimeout(() => setFete(null), DUREE_MS);
    return () => clearTimeout(minuteur);
  }, [rainbowWinnerId]);

  /* Le contexte audio se ferme quand la fête se termine : un onglet qui en
     accumule un par partie finit par se voir refuser le suivant, les
     navigateurs en limitant le nombre par page. */
  React.useEffect(() => {
    if (fete !== null) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    audioRef.current = null;
    const fermeture = setTimeout(() => { ctx.close?.().catch(() => {}); }, 500);
    return () => clearTimeout(fermeture);
  }, [fete]);

  if (fete === null) return null;

  const nom = titanDisplayName ? titanDisplayName(fete) : `Titan ${fete}`;

  return (
    <>
      <style>{`
        @keyframes titan-arc-entree {
          0%   { opacity: 0; transform: scale(.55) translateY(28px); }
          55%  { opacity: 1; transform: scale(1.06) translateY(0); }
          70%  { transform: scale(1); }
          88%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.04); }
        }
        @keyframes titan-arc-trace {
          from { stroke-dashoffset: 340; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes titan-arc-halo {
          0%   { opacity: 0; }
          30%  { opacity: .9; }
          100% { opacity: 0; }
        }
        /* Un joueur qui a demandé moins d'animations garde l'information —
           l'arc et le texte s'affichent — mais rien ne bouge ni ne clignote. */
        @media (prefers-reduced-motion: reduce) {
          .titan-arc-scene, .titan-arc-halo { animation: none !important; opacity: 1 !important; transform: none !important; }
          .titan-arc-trait { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={`Trophée Arc-en-ciel pour ${nom}`}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          display: "flex", alignItems: "center", justifyContent: "center",
          // Purement décoratif : il n'intercepte aucun clic, la partie continue
          // derrière lui.
          pointerEvents: "none",
        }}
      >
        <div
          className="titan-arc-halo"
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(closest-side, rgba(255,255,255,.16), rgba(0,0,0,.55))",
            animation: `titan-arc-halo ${DUREE_MS}ms ease-out forwards`,
          }}
        />
        <div
          className="titan-arc-scene"
          style={{
            position: "relative", textAlign: "center",
            animation: `titan-arc-entree ${DUREE_MS}ms cubic-bezier(.22,1,.36,1) forwards`,
          }}
        >
          <svg viewBox="0 0 220 130" width="min(78vw, 460px)" height="auto" aria-hidden="true">
            {ARC_COULEURS.map((c, i) => (
              <path
                key={c}
                className="titan-arc-trait"
                d={`M ${18 + i * 7} 122 A ${92 - i * 7} ${92 - i * 7} 0 0 1 ${202 - i * 7} 122`}
                fill="none"
                stroke={c}
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeDasharray="340"
                style={{
                  animation: `titan-arc-trace 900ms cubic-bezier(.4,0,.2,1) ${i * 70}ms both`,
                  filter: "drop-shadow(0 0 6px rgba(255,255,255,.35))",
                }}
              />
            ))}
          </svg>
          <div style={{
            marginTop: -6,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            fontFamily: "'Bowlby One', sans-serif", fontSize: "clamp(1.1rem, 4.2vw, 1.9rem)",
            color: "#fffaee", textShadow: "0 2px 14px rgba(0,0,0,.85)",
          }}>
            <TitanIcon titanId={fete} size={34} variant="plain" />
            ARC-EN-CIEL !
          </div>
          <div style={{
            marginTop: 6, fontSize: "clamp(.78rem, 2.6vw, .95rem)",
            color: "rgba(255,255,255,.9)", textShadow: "0 2px 10px rgba(0,0,0,.85)",
          }}>
            {nom} réunit les 5 couleurs — Trophée, +5 points au décompte.
          </div>
        </div>
      </div>
    </>
  );
}
