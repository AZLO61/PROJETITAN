import React from "react";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { profileLabel } from "../../domain/index.js";

/* ── LES TITANS QUITTENT LA COLONNE DU PLATEAU ─────────────
   Nikola, 2026-08-28 : « j'imagine les informations des titans à la place de
   là où on joue les cartes, les cartes qu'on joue qui passent en dessous, là
   où y avait le scoring — comme ça ça libère l'espace pour le plateau ».

   La bande vivait au-dessus de la grille, donc dans la colonne large : elle
   prenait au plateau une hauteur entière alors qu'elle n'a jamais eu besoin
   de sa largeur. Elle monte dans la colonne des commandes, où elle est de
   toute façon lue au même moment que le tour qu'on est en train de jouer.

   Ce fichier n'est qu'un raccord : il rebranche les mêmes props depuis `vm`
   plutôt que depuis `RoundPanels`, pour que le déplacement ne fasse pas
   transiter une douzaine de propriétés par un composant qui ne s'en sert
   plus. `TitanResourceBand` est inchangé. */
export default function TitanBandPanel({ vm }) {
  const { titanState } = vm;

  /* Ordre d'initiative RÉEL de la Manche : l'ordre de jeu pivoté sur le
     Détonateur, qui ouvre chaque round (cf. `advanceActionRound`). C'est lui
     qui est affiché, pas l'ordre figé de la partie. Il suit la bande, il n'a
     jamais servi ailleurs. */
  const ordreInitiative = (() => {
    const ordre = titanState?.ordreJeu ?? [];
    const depart = ordre.indexOf(titanState?.detonateur);
    if (depart <= 0) return ordre;
    return [...ordre.slice(depart), ...ordre.slice(0, depart)];
  })();

  return (
    <TitanResourceBand
      titans={titanState.players}
      selectedTitanId={vm.selectedTitanId}
      onSelect={vm.setSelectedTitanId}
      activePlayerId={vm.activePlayerId}
      phase={vm.phase}
      titanDisplayName={vm.titanDisplayName}
      titanModes={vm.titanModes}
      titanProfiles={vm.titanProfiles}
      profilsReveles={vm.profilsReveles}
      revelerProfil={vm.revelerProfil}
      profileLabel={profileLabel}
      waitingNextTitan={vm.waitingNextTitan}
      titansEnAttente={vm.titansEnAttente}
      rainbowWinnerId={vm.rainbowWinnerId}
      phaseValidated={vm.phaseValidated}
      ordreInitiative={ordreInitiative}
      detonateurId={titanState.detonateur}
      validatePhase={vm.validatePhase}
      canValidatePhase={vm.canValidatePhase}
      getPhaseBlockReason={vm.getPhaseBlockReason}
    />
  );
}
