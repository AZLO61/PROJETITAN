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

/* Une note : oscillateur carré (couleur arcade), montée/descente rapides
   pour éviter le clic d'attaque et de coupure. */
function jouerNote(ctx, freq, debut, duree, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, debut);
  gain.gain.linearRampToValueAtTime(volume, debut + 0.015);
  gain.gain.setValueAtTime(volume, debut + duree - 0.03);
  gain.gain.linearRampToValueAtTime(0, debut + duree);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(debut);
  osc.stop(debut + duree);
}

/* Fanfare de fin de partie : Do-Mi-Sol-Do à l'octave, montante. */
export function jouerJingleFin() {
  if (sonCoupe()) return;
  const ctx = contexte();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const maintenant = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // Do5, Mi5, Sol5, Do6
  notes.forEach((freq, i) => jouerNote(ctx, freq, maintenant + i * 0.14, 0.22, 0.16));
}
