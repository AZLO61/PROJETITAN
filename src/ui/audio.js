/* ============================================================
   SON — un jingle de victoire synthétisé, et rien d'autre
   ============================================================
   Aucun fichier audio dans ce dépôt (Nikola, 2026-09-17 : pas de fichier
   sous la main). Le jingle est composé en Web Audio, quelques notes
   d'arcade jouées à la volée plutôt qu'un asset à charger. Une préférence
   « son coupé » vit dans localStorage et gate tout ce qui joue ici. */

const CLE_MUET = "titan.son.coupe";

export function sonCoupe() {
  try { return window.localStorage.getItem(CLE_MUET) === "1"; } catch { return false; }
}

export function definirSonCoupe(coupe) {
  try { window.localStorage.setItem(CLE_MUET, coupe ? "1" : "0"); } catch { /* tant pis */ }
}

let contexteAudio = null;
function contexte() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!contexteAudio) contexteAudio = new Ctor();
  return contexteAudio;
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
function jouerNote(ctx, sortie, freq, debut, duree, volume, forme = "triangle") {
  const DETENTE = 0.26; // la queue qui déborde sur la note suivante
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = forme;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.02);
  gain.gain.setValueAtTime(volume, debut + duree * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree + DETENTE);
  osc.connect(gain);
  gain.connect(sortie);
  osc.start(debut);
  osc.stop(debut + duree + DETENTE);
}

/* ── LA PETITE MUSIQUE DE TRIOMPHE ──────────────────────────
   L'ancienne fanfare était un arpège de Do majeur en quatre croches égales,
   0,64 s en tout. Quatre notes à intervalle constant ne font pas une phrase :
   il n'y a ni élan ni arrivée, ça monte et ça s'arrête.

   Celle-ci en fait une, sur le patron le plus reconnaissable du genre — trois
   croches d'élan, une tenue, une sensible, puis la tonique tenue à l'octave :

     Do5 · Mi5 · Sol5   l'élan, trois croches serrées sur l'accord de tonique
     Do6                première arrivée, deux fois plus longue
     Si5                la sensible, la seule note hors de l'accord — c'est
                        elle qui donne envie que ça se résolve
     Do6                la résolution, tenue le double du reste

   ≈ 1,9 s avec la détente de la dernière note, contre 0,64 s : « un peu plus
   long » sans jamais retenir l'écran, puisque le podium s'ouvre par-dessus
   pendant que ça sonne.

   LA BASSE FAIT LE TRIOMPHE, PAS LE VOLUME. Une sinusoïde à l'octave basse
   tenue sous toute la phrase donne le corps qu'un arpège nu n'a pas, à un
   tiers du niveau de la mélodie : c'est ce qui permet de baisser le volume
   d'ensemble de 0,16 à 0,10 tout en s'entendant MIEUX. Une sinusoïde n'a
   aucune harmonique, elle ne peut donc pas rendre l'aigu plus dur — elle ne
   fait que poser le fond.

   Le tout passe par un gain de sortie unique : six notes qui se recouvrent
   s'additionnent, et sans ce plafond commun les tenues finales saturaient. */
const PHRASE_TRIOMPHE = [
  { freq: 523.25, debut: 0.00, duree: 0.13 },  // Do5  — croche
  { freq: 659.25, debut: 0.13, duree: 0.13 },  // Mi5  — croche
  { freq: 783.99, debut: 0.26, duree: 0.13 },  // Sol5 — croche
  { freq: 1046.50, debut: 0.39, duree: 0.26 }, // Do6  — première arrivée, 2 croches
  { freq: 987.77, debut: 0.65, duree: 0.13 },  // Si5  — la sensible, une croche
  { freq: 1046.50, debut: 0.78, duree: 0.65 }, // Do6  — la résolution, 5 croches
];

export function jouerJingleFin() {
  if (sonCoupe()) return;
  const ctx = contexte();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const t0 = ctx.currentTime;

  const sortie = ctx.createGain();
  sortie.gain.value = 0.10;
  sortie.connect(ctx.destination);

  PHRASE_TRIOMPHE.forEach(({ freq, debut, duree }) => {
    jouerNote(ctx, sortie, freq, t0 + debut, duree, 1);
  });

  // Le Do grave sous toute la phrase — le fond, pas une note de plus.
  const fin = PHRASE_TRIOMPHE[PHRASE_TRIOMPHE.length - 1];
  jouerNote(ctx, sortie, 261.63, t0, fin.debut + fin.duree, 0.34, "sine");
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
