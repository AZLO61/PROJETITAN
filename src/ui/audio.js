/* ============================================================
   SON — un jingle de victoire synthétisé, et rien d'autre
   ============================================================
   Aucun fichier audio dans ce dépôt (Nikola, 2026-09-17 : pas de fichier
   sous la main). Le jingle est composé en Web Audio, quelques notes
   d'arcade jouées à la volée plutôt qu'un asset à charger. Le volume vit dans
   localStorage et gate tout ce qui joue ici. */

/* ── QUATRE PALIERS DE VOLUME ──
   Nikola, 2026-09-22 : « une icône haut-parleur avec 3 ondes ; on peut gérer
   le volume de 0 à 100 — à 100 il y a 3 ondes, à 67 % 2 ondes, à 33 % 1 onde,
   à 0 le haut-parleur est barré ». Un clic sur l'icône passe au palier
   suivant, dans cet ordre. L'ancienne préférence « son coupé » est reprise :
   un joueur qui avait coupé le son le retrouve coupé. */
const CLE_VOLUME = "titan.son.volume";
const CLE_MUET = "titan.son.coupe";
const PALIERS = [100, 67, 33, 0];

export function volumeSon() {
  try {
    const brut = window.localStorage.getItem(CLE_VOLUME);
    if (brut !== null && PALIERS.includes(Number(brut))) return Number(brut);
    return window.localStorage.getItem(CLE_MUET) === "1" ? 0 : 100;
  } catch { return 100; }
}

export function definirVolumeSon(v) {
  try { window.localStorage.setItem(CLE_VOLUME, String(v)); } catch { /* tant pis */ }
}

/** Le palier qui suit `v` dans le cycle du clic : 100 → 67 → 33 → 0 → 100. */
export function palierSuivant(v) {
  const i = PALIERS.indexOf(v);
  return PALIERS[(i + 1) % PALIERS.length];
}

/** Nombre d'ondes à dessiner pour un volume : 3, 2, 1, ou 0 (barré). */
export function ondesPourVolume(v) {
  if (v <= 0) return 0;
  return v <= 33 ? 1 : v <= 67 ? 2 : 3;
}

let contexteAudio = null;
function contexte() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!contexteAudio) contexteAudio = new Ctor();
  return contexteAudio;
}

/* ── LE SON DÉVERROUILLÉ AU PREMIER GESTE ──
   Nikola, 2026-09-22 : « avec une partie 100 % IA aussi il faut le son de
   victoire à la fin ».

   Le jingle part d'un effet React, pas d'un clic. Un navigateur n'autorise un
   contexte audio qu'après un geste de l'utilisateur, et Safari exige qu'il
   soit créé ou relancé PENDANT ce geste : une partie où les IA jouent seules
   finissait donc souvent en silence. Le contexte est créé et relancé au
   premier geste de la page — le clic « Lancer la partie » suffit — pour être
   prêt quand la fin arrive. */
if (typeof window !== "undefined") {
  const gestes = ["pointerdown", "keydown", "touchend"];
  const deverrouiller = () => {
    const ctx = contexte();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    gestes.forEach((g) => window.removeEventListener(g, deverrouiller, true));
  };
  gestes.forEach((g) => window.addEventListener(g, deverrouiller, true));
}

/* ── UNE NOTE, ET POURQUOI ELLE NE CLAQUE PLUS ──────────────
   Nikola, 2026-09-19 : « fin de partie le son plus doux et un peu plus long,
   une petite musique de triomphe ».

   Trois choses rendaient l'ancien jingle dur, et elles se corrigent
   séparément.

   1. LA FORME D'ONDE. `square` contient toutes les harmoniques impaires à
      pleine puissance : c'est le timbre « bip d'arcade », brillant et
      agressif dès qu'on monte dans l'aigu — or ce jingle finit à 1046 Hz.
      `triangle` a le même profil impair mais des harmoniques qui décroissent
      en 1/n², donc le même caractère synthétique, adouci.

   2. L'ENVELOPPE. Les rampes étaient LINÉAIRES, et l'oreille entend le volume
      en logarithmique : une descente linéaire s'entend comme une coupure
      brutale suivie d'une longue traîne inaudible. `exponentialRampToValue`
      décroît comme l'oreille écoute. Il ne peut pas viser zéro (la fonction
      est indéfinie en 0), d'où la cible à 0,0001 puis l'arrêt sec, qui n'est
      plus audible à ce niveau.

   3. LA QUEUE. Chaque note s'arrêtait à sa durée exacte, donc six notes
      donnaient six coupures nettes. Elles se prolongent maintenant d'une
      détente propre au-delà de leur durée rythmique, et se recouvrent : c'est
      ce recouvrement qui fait entendre une phrase plutôt qu'une suite de
      bips. */
function jouerNote(ctx, sortie, freq, debut, duree, volume, forme = "triangle", detente = 0.26) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = forme;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, debut);
  // Attaque à 40 ms : sous 20 ms, l'oreille entend un « tic » au départ.
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.04);
  gain.gain.setValueAtTime(volume, debut + duree * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree + detente);
  osc.connect(gain);
  gain.connect(sortie);
  osc.start(debut);
  osc.stop(debut + duree + detente);
}

/* ── LA PETITE MUSIQUE DE TRIOMPHE, SECONDE VERSION ─────────
   Nikola, 2026-09-22, même demande qu'au 19/09 : « le son plus doux et un peu
   plus long ». La première correction avait changé le timbre (carré →
   triangle) et l'enveloppe, mais gardé le REGISTRE : la phrase montait
   jusqu'au Do6 (1046 Hz) et y tenait sa note la plus longue. C'est là que
   l'oreille est la plus sensible, et c'est là qu'on la laissait.

   Cette version descend d'une quarte, ralentit d'environ 40 %, et finit sur un
   ACCORD tenu plutôt qu'une note seule :

     Sol4 · Do5 · Mi5   l'élan, trois croches
     Sol5               la première arrivée, tenue
     Mi5                le petit retour
     Sol5               l'arrivée finale, la plus longue, portée par un accord
                        de Do (Do4 · Mi4 en sinusoïdes) et le Do grave

   Sommet à 784 Hz au lieu de 1046, ≈ 3,2 s au lieu de 1,9 avec la détente
   de l'accord final (0,7 s), volume de sortie abaissé de 0,10 à 0,08. */
const CROCHE = 0.18;
const PHRASE_TRIOMPHE = [
  { freq: 392.00, debut: 0, duree: CROCHE },                 // Sol4
  { freq: 523.25, debut: CROCHE, duree: CROCHE },            // Do5
  { freq: 659.25, debut: 2 * CROCHE, duree: CROCHE },        // Mi5
  { freq: 783.99, debut: 3 * CROCHE, duree: 3 * CROCHE },    // Sol5 — première arrivée
  { freq: 659.25, debut: 6 * CROCHE, duree: CROCHE },        // Mi5
  { freq: 783.99, debut: 7 * CROCHE, duree: 7 * CROCHE },    // Sol5 — l'arrivée
];

/* Le gain de sortie à 100 % : c'est le plafond que la seconde version du
   jingle a fixé (0,08), les paliers ne font que le réduire. */
const GAIN_PLEIN = 0.08;

function sortieAuVolume(ctx, volume) {
  const sortie = ctx.createGain();
  sortie.gain.value = GAIN_PLEIN * (volume / 100);
  sortie.connect(ctx.destination);
  return sortie;
}

export function jouerJingleFin() {
  const volume = volumeSon();
  if (volume === 0) return;
  const ctx = contexte();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const t0 = ctx.currentTime;

  const sortie = sortieAuVolume(ctx, volume);

  const fin = PHRASE_TRIOMPHE[PHRASE_TRIOMPHE.length - 1];
  PHRASE_TRIOMPHE.forEach(({ freq, debut, duree }) => {
    jouerNote(ctx, sortie, freq, t0 + debut, duree, 1, "triangle", debut === fin.debut ? 0.7 : 0.26);
  });

  // L'accord de Do sous l'arrivée finale : c'est lui qui dit « gagné ».
  [261.63, 329.63].forEach((freq) => {
    jouerNote(ctx, sortie, freq, t0 + fin.debut, fin.duree, 0.4, "sine", 0.7);
  });
  // Le Do grave sous toute la phrase — le fond, pas une note de plus.
  jouerNote(ctx, sortie, 130.81, t0, fin.debut + fin.duree, 0.3, "sine", 0.7);
}

/* Un Do tenu au nouveau volume, joué au clic sur l'icône : on entend le
   palier qu'on vient de choisir au lieu de le découvrir à la fin de la partie.
   Rien à 0 — le haut-parleur barré dit déjà tout. */
export function jouerApercuVolume(volume) {
  if (volume === 0) return;
  const ctx = contexte();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  jouerNote(ctx, sortieAuVolume(ctx, volume), 523.25, ctx.currentTime, 0.18, 1, "triangle", 0.3);
}

/* Vérification minimale de la phrase : elle doit se lire dans l'ordre, sans
   trou ni chevauchement rythmique (la détente, elle, déborde exprès), et finir
   sur la note la plus longue — c'est ce qui en fait une résolution et non une
   note de plus. Exportée pour le test ; le son lui-même n'est pas testable. */
export function verifierPhraseTriomphe(phrase = PHRASE_TRIOMPHE) {
  for (let i = 1; i < phrase.length; i++) {
    const attendu = phrase[i - 1].debut + phrase[i - 1].duree;
    if (Math.abs(phrase[i].debut - attendu) > 1e-9) return false;
  }
  const finale = phrase[phrase.length - 1];
  return phrase.every((n) => n.duree <= finale.duree) && phrase.length > 4;
}
