import React from "react";
import { TitanIcon } from "./titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "./titans/constants.js";
import { T, marquee, readout, label, prose } from "./theme.js";
import Icon from "./icons.jsx";
// L'échelle de difficulté vit dans le domaine : l'écran d'accueil, le profil
// dévoilé et les campagnes de mesure en nomment les barreaux de la même façon.
import { FORCES, FORCE_LABELS } from "../domain/aiEvaluation.js";

/* ============================================================
   L'ÉCRAN D'ACCUEIL — LA SÉLECTION DES JOUEURS
   ============================================================
   C'est le premier écran que voit n'importe qui, et il vivait en ligne dans
   le contrôleur : 190 lignes de JSX au milieu de la logique de jeu. Il en
   sort ici, et il devient ce qu'il a toujours été sans le dire — l'écran de
   sélection des personnages d'une borne d'arcade.

   Ce n'est pas un habillage : c'est la bonne forme pour ce que fait cet
   écran. On choisit combien on est, on choisit qui est qui, et on lance.
   Une borne pose exactement les mêmes questions, dans le même ordre, avec
   les portraits en grand — parce que le choix qui compte est celui-là.
============================================================ */

/* Un bloc de réglage. Pas de plaque, pas de cadre : un titre en bandeau et
   un filet. Aucun conteneur n'existe ici pour porter une bordure. */
function Reglage({ titre, aide, children }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ ...label(T.you, T.micro), marginBottom: aide ? 4 : 10 }}>{titre}</h2>
      {aide && <p style={{ ...prose(T.faint, T.micro), margin: "0 0 10px" }}>{aide}</p>}
      {children}
    </section>
  );
}

export default function SetupScreen({
  nbJoueurs, setNbJoueurs, manchesMax,
  titanNames, setTitanNames,
  titanModes, setTitanModes,
  eventsEnabled, setEventsEnabled,
  difficulte, setDifficulte,
  modeVolRepos, setModeVolRepos,
  apocalypseThreshold, setApocalypseThreshold,
  seedInput, setSeedInput,
  onLancer,
}) {
  const champ = {
    background: "rgba(0,0,0,.45)",
    color: T.text,
    border: `2px solid ${T.rule}`,
    borderRadius: T.rChip,
    padding: "9px 11px",
    fontFamily: T.ui,
    fontSize: T.body,
    fontWeight: 600,
    outline: "none",
  };

  return (
    <div
      className="titan-cabinet"
      style={{
        fontFamily: T.ui,
        background: T.screen,
        color: T.text,
        minHeight: "100vh",
        padding: "40px 20px 56px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "relative", zIndex: 3, maxWidth: 720, margin: "0 auto" }}>
        {/* ── LE FRONTON ──
            Le titre à la taille qu'il a en vrai sur une borne : celle qu'on
            lit depuis l'autre bout de la salle. */}
        <header style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={marquee("clamp(2.4rem, 9vw, 4.5rem)", T.you)}>Projet Titan</h1>
          {/* « Big City · 9 × 9 » disait la taille du plateau, une chose
              qu'on découvre en deux secondes en le regardant. Sous le titre,
              la seule ligne qui serve est celle qui dit quoi faire de cet
              écran (Nikola, 2026-08-28). */}
          <p style={{ ...label(T.dim, T.small), marginTop: 10, letterSpacing: ".28em" }}>
            Règle ta partie avant de jouer
          </p>
        </header>

        {/* ── COMBIEN DE JOUEURS ── */}
        <Reglage titre="Nombre de Titans">
          <div style={{ display: "flex", gap: 10 }}>
            {[3, 4].map((n) => {
              const on = nbJoueurs === n;
              return (
                <button
                  key={n}
                  onClick={() => setNbJoueurs(n)}
                  aria-pressed={on}
                  style={{
                    flex: 1,
                    background: on ? T.you : "transparent",
                    border: `2px solid ${on ? T.you : T.rule}`,
                    borderRadius: T.rChip,
                    color: on ? "#1a1400" : T.dim,
                    padding: "14px 0",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    boxShadow: on ? `0 3px 0 ${T.edge}` : "none",
                    transition: `background 140ms linear, border-color 140ms linear`,
                  }}
                >
                  <span style={readout("1.3rem", on ? "#1a1400" : T.text)}>{n}</span>
                  <span style={label(on ? "#1a1400" : T.faint, "0.68rem")}>
                    {manchesMax(n)} Manches
                  </span>
                </button>
              );
            })}
          </div>
        </Reglage>

        {/* ── QUI JOUE QUOI ──
            La sélection de personnage : le portrait en grand, le nom, et le
            choix humain / IA. C'est le seul endroit de l'application où les
            quatre Titans sont côte à côte à cette taille, et c'est voulu —
            c'est là qu'on les adopte. */}
        <Reglage
          titre="Les Titans"
          aide="Donne-leur un nom, et dis qui tient la manette."
        >
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: nbJoueurs }, (_, i) => i + 1).map((id) => {
              const tc = TITAN_COLORS[id];
              const mode = titanModes[id] || "humain";
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: T.plate,
                    /* La couleur du joueur porte le cerne entier, pas un
                       onglet de 6 px sur le flanc gauche. Le bandeau latéral
                       coloré est le tic le plus reconnaissable des interfaces
                       fabriquées à la chaîne, et il disait moins bien la même
                       chose : ici la plaque ENTIÈRE appartient au Titan. */
                    border: `2px solid ${tc?.accent || T.rule}`,
                    borderRadius: T.rPlate,
                    padding: "10px 12px",
                    flexWrap: "wrap",
                  }}
                >
                  {/* La pastille « 1P / 2P » a été retirée (Nikola,
                      2026-08-28). Elle numérotait une place autour de la
                      table, alors que le portrait, la couleur et le nom
                      saisi désignent déjà le Titan — trois fois la même
                      information, dont une en jargon de borne. */}
                  <TitanIcon titanId={id} size={40} variant="plain" />
                  {/* Le champ se fond dans la ligne : un simple soulignement à
                      la couleur du Titan. Le texte saisi reste blanc — en
                      couleur d'accent sur fond teinté, un nom devenait
                      illisible. */}
                  <input
                    type="text"
                    value={titanNames[id]}
                    onChange={(e) =>
                      setTitanNames((prev) => ({ ...prev, [id]: e.target.value.slice(0, 18) }))
                    }
                    placeholder={`Titan ${id}`}
                    maxLength={18}
                    aria-label={`Nom du Titan ${id}`}
                    style={{
                      flex: 1,
                      minWidth: 120,
                      background: "transparent",
                      border: "none",
                      borderBottom: `2px solid ${tc?.accent || T.rule}66`,
                      borderRadius: 0,
                      color: T.text,
                      padding: "6px 2px",
                      fontFamily: T.ui,
                      fontSize: T.body,
                      fontWeight: 600,
                      outline: "none",
                    }}
                    title="Choisis le nom de ton Titan (18 caractères max)"
                  />
                  {/* UN SEUL BOUTON, ENFONCÉ OU NON (Nikola, 2026-08-28 :
                      « ne fais pas de bouton Humain, fais juste IA cliqué ou
                      non »). Deux boutons pour un choix binaire obligent à
                      lire les deux pour savoir lequel est actif ; un
                      interrupteur se lit d'un coup. Et « Humain » n'est pas
                      un réglage, c'est l'absence d'IA. */}
                  <button
                    onClick={() =>
                      setTitanModes((prev) => ({ ...prev, [id]: prev[id] === "ia" ? "humain" : "ia" }))
                    }
                    role="switch"
                    aria-checked={mode === "ia"}
                    aria-label={`Titan ${id} joué par l'IA`}
                    title={mode === "ia" ? "Piloté par l'IA — clique pour le rendre à un joueur" : "Joué par un humain — clique pour le confier à l'IA"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: mode === "ia" ? T.tele : "transparent",
                      border: `2px solid ${mode === "ia" ? T.tele : T.rule}`,
                      borderRadius: T.rChip,
                      color: mode === "ia" ? "#0f0826" : T.faint,
                      padding: "7px 13px",
                      cursor: "pointer",
                      flexShrink: 0,
                      ...label(mode === "ia" ? "#0f0826" : T.faint, "0.68rem"),
                    }}
                  >
                    <Icon name="bot" size={13} />
                    IA
                  </button>
                </div>
              );
            })}
          </div>
        </Reglage>

        {/* ── DIFFICULTÉ ──
            Nikola, 2026-08-28 : « j'aimerais avoir 4 niveaux de difficulté
            clairement distincts ». Le réglage existait, mais il était rangé
            en bas avec le Seuil Apocalypse et la graine, sous le nom
            « Niveau des IA », et proposait trois entrées dont deux
            décrivaient un TIRAGE (« Mêlé », « Confirmé mini ») plutôt qu'un
            niveau. On ne savait pas ce qu'on choisissait.

            Il remonte donc juste sous la sélection des joueurs, à la même
            taille qu'elle : après « qui joue », la question suivante est
            « contre quoi ». Quatre entrées, dans l'ordre croissant, et
            chacune dit en une ligne ce que l'IA sait faire de plus que la
            précédente — c'est la seule façon de rendre l'échelle lisible
            sans jargon de réglage. */}
        <Reglage
          titre="Difficulté"
          aide="Toutes les IA jouent au niveau choisi. Leur tempérament, lui, reste tiré au sort : deux parties de même niveau ne se ressemblent pas."
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
            {/* UNE COULEUR PAR NIVEAU (Nikola, 2026-08-28). Les quatre
                s'allumaient dans le même jaune : la couleur disait
                « sélectionné », elle ne disait pas LEQUEL. Elles reprennent
                donc les quatre signaux que le jeu emploie déjà, dans l'ordre
                où il les emploie — le vert du disponible, le cyan du passif,
                l'orange de l'alerte, le rouge de l'arrêt. On lit le niveau
                choisi à la couleur seule, sans relire les quatre libellés. */}
            {[
              { cle: FORCES.FACILE, ton: T.go, aide: "Ne compte que son butin. Ignore les bonus de fin, et se trompe de temps en temps." },
              { cle: FORCES.MOYEN, ton: T.move, aide: "Compte tout le décompte. Mais se déplace sans savoir quelle carte il jouera de là." },
              { cle: FORCES.DIFFICILE, ton: T.warn, aide: "Place son Titan POUR sa carte, et prépare sa Manche coup après coup." },
              { cle: FORCES.EXPERT, ton: T.stop, aide: "En plus : regarde ce qu'il vous offre, et ce que chaque vol vous coûte vraiment." },
            ].map(({ cle, ton, aide }) => {
              const on = difficulte === cle;
              return (
                <button
                  key={cle}
                  onClick={() => setDifficulte(cle)}
                  aria-pressed={on}
                  /* Le libellé visible est dans un span imbriqué avec sa
                     phrase d'explication : sans nom accessible, le lecteur
                     d'écran annonçait « bouton » quatre fois de suite. */
                  aria-label={`Difficulté ${FORCE_LABELS[cle]} — ${aide}`}
                  style={{
                    background: on ? ton : "transparent",
                    border: `2px solid ${on ? ton : T.rule}`,
                    borderRadius: T.rChip,
                    color: on ? "#0f0826" : T.dim,
                    padding: "11px 12px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 5,
                    textAlign: "left",
                    boxShadow: on ? `0 3px 0 ${T.edge}` : "none",
                    transition: "background 140ms linear, border-color 140ms linear",
                  }}
                >
                  <span style={label(on ? "#0f0826" : ton, T.small)}>{FORCE_LABELS[cle]}</span>
                  <span style={{ ...prose(on ? "#0f0826" : T.faint, T.micro), lineHeight: 1.35 }}>{aide}</span>
                </button>
              );
            })}
          </div>
        </Reglage>

        {/* ── RÉGLAGES DE PARTIE ──
            Trois réglages qu'on touche rarement : ils tiennent sur une seule
            rangée plutôt que sur trois blocs empilés de la même taille que la
            sélection des joueurs, qui, elle, compte. */}
        <Reglage titre="Réglages de partie">
          <div style={{ display: "grid", gap: 8 }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 11,
                border: `2px solid ${eventsEnabled ? T.move : T.rule}`,
                borderRadius: T.rChip,
                padding: "11px 13px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={eventsEnabled}
                onChange={(e) => setEventsEnabled(e.target.checked)}
                style={{ marginTop: 3, accentColor: T.move, width: 17, height: 17 }}
              />
              <span>
                <span style={label(eventsEnabled ? T.move : T.dim, T.small)}>Événements</span>
                <span style={{ ...prose(T.faint, T.micro), display: "block", marginTop: 3 }}>
                  Ajoute la Phase 1 à chaque Manche. Le tirage fonctionne, les
                  effets ne sont pas encore codés.
                </span>
              </span>
            </label>

            {/* ── CE QUE FAIT LE VOL DE PHASE REPOS ──
                Nikola, 2026-08-28 : « faudrait que ça soit un mode avant le
                lancement pour la phase Repos : soit c'est la carte de la
                victime qui va dans sa zone Repos, soit ça va dans la main du
                Titan qui a sélectionné la carte ».

                Les deux versions changent la nature de la phase, pas son
                dosage : l'une prive, l'autre transfère. Ça ne se règle donc
                pas au curseur, ça se choisit — et avant de commencer, comme
                le nombre de Manches. */}
            <div style={{ border: `2px solid ${T.rule}`, borderRadius: T.rChip, padding: "11px 13px" }}>
              <div style={{ ...label(T.dim, T.small), marginBottom: 8 }}>Vol de Phase Repos</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))" }}>
                {[
                  { cle: "repos", nom: "Mise au repos", aide: "La carte tirée part en Zone Repos chez sa victime : elle en est privée une Manche, personne ne la gagne." },
                  { cle: "main", nom: "Emprunt", aide: "La carte tirée passe en main du voleur pour la Manche, puis retourne à son propriétaire." },
                ].map(({ cle, nom, aide }) => {
                  const on = modeVolRepos === cle;
                  return (
                    <button
                      key={cle}
                      onClick={() => setModeVolRepos(cle)}
                      aria-pressed={on}
                      aria-label={`Vol de Phase Repos : ${nom} — ${aide}`}
                      style={{
                        background: on ? T.tele : "transparent",
                        border: `2px solid ${on ? T.tele : T.rule}`,
                        borderRadius: T.rChip,
                        color: on ? "#0f0826" : T.dim,
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                        textAlign: "left",
                      }}
                    >
                      <span style={label(on ? "#0f0826" : T.tele, T.small)}>{nom}</span>
                      <span style={{ ...prose(on ? "#0f0826" : T.faint, T.micro), lineHeight: 1.35 }}>{aide}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: `2px solid ${T.rule}`, borderRadius: T.rChip, padding: "11px 13px" }}>
              <label style={label(T.dim, T.small)} htmlFor="seuil-apo">
                Seuil Apocalypse
              </label>
              <input
                id="seuil-apo"
                type="number"
                min="0"
                max="24"
                value={apocalypseThreshold}
                onChange={(e) =>
                  setApocalypseThreshold(Math.max(0, Math.min(24, Number(e.target.value) || 0)))
                }
                style={{ ...champ, width: 74, textAlign: "center" }}
              />
              <span style={prose(T.faint, T.micro)}>
                bâtiments encore debout = fin de partie.
              </span>
            </div>

            {/* GRAINE — Nikola, 2026-08-24 : « rejouer une partie depuis sa
                graine ». Vide pour une partie normale ; colle la graine d'un
                rapport de bug pour retomber exactement sur la même partie
                (même plateau, mêmes positions, même ordre de jeu, mêmes
                profils d'IA). */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: `2px solid ${T.rule}`, borderRadius: T.rChip, padding: "11px 13px" }}>
              <label style={label(T.dim, T.small)} htmlFor="graine">
                Graine
              </label>
              <input
                id="graine"
                type="text"
                inputMode="numeric"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="aléatoire"
                style={{ ...champ, width: 150, fontFamily: T.readout, fontSize: T.micro }}
              />
              <span style={prose(T.faint, T.micro)}>
                vide = partie normale. Une graine rejoue la même partie à l'identique.
              </span>
            </div>
          </div>
        </Reglage>

        {/* ── LA TOUCHE DE DÉPART ──
            Une borne n'a qu'un seul bouton de cette taille, et il ne fait
            qu'une chose. */}
        <button
          onClick={onLancer}
          style={{
            width: "100%",
            background: T.go,
            border: `2px solid ${T.edge}`,
            borderRadius: T.rChip,
            color: "#00311e",
            padding: "20px 0",
            cursor: "pointer",
            boxShadow: `0 5px 0 ${T.edge}`,
            ...marquee("1.35rem", "#00311e"),
            WebkitTextStroke: "0",
          }}
        >
          Lancer la partie
        </button>
      </div>
    </div>
  );
}
