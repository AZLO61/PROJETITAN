import React from "react";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { countRepaireColors, BAREME_ADRENALINE } from "../../domain/index.js";
import { smallBtn, cancelBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME, scoreBloc } from "../blockNames.js";
import { T, marquee, readout, label, prose } from "../theme.js";
import Icon, { AdrenalineIcon, RainbowIcon } from "../icons.jsx";

/* ============================================================
   MENU DEROULANT A LA CHARTE
   ============================================================
   Point 4.3 de la liste du 2026-08-19 : Â« refondre le menu deroulant complet
   selon la charte graphique officielle du site Â».

   Le placement des Verts, qui est le tout dernier geste de la partie et le
   plus lourd de consequences, se faisait avec des `<select>` NATIFS. Sur
   Windows, le systeme dessine alors sa propre liste : fond blanc, police
   systeme, surlignage bleu. En plein ecran de decompte, sur un fond violet
   sombre, l'effet est celui d'une boite de dialogue etrangere au jeu â et
   aucun style CSS ne peut l'atteindre, c'est le systeme qui la peint.

   Ce menu-ci est donc dessine par l'application. Il reprend la charte deja
   en place ailleurs : fond sombre translucide, bordure claire, jaune #FFD93D
   pour l'accent, vert #16E08C pour ce qui est acquis, coins a 6-8 px.

   Il garde le comportement d'un select : fermeture au clic exterieur et a
   Echap, option desactivee non cliquable, valeur courante affichee. */
function MenuDA({ valeur, options, placeholder, onChange }) {
  const [ouvert, setOuvert] = React.useState(false);
  const boite = React.useRef(null);

  React.useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const choisie = options.find((o) => o.value === valeur);

  return (
    <div ref={boite} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        style={{
          background: choisie ? "rgba(22,224,140,.14)" : "rgba(255,255,255,.08)",
          color: choisie ? "#7ef2a8" : "#fffaee",
          border: `1px solid ${choisie ? "rgba(22,224,140,.5)" : "rgba(255,255,255,.2)"}`,
          borderRadius: 6, padding: "3px 8px", fontSize: ".7rem",
          fontFamily: "inherit", fontWeight: choisie ? 700 : 400,
          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {choisie?.icone}
        {choisie ? choisie.label : placeholder}
        <span style={{ fontSize: ".6rem", opacity: .7 }}>{ouvert ? "▲" : "▼"}</span>
      </button>

      {ouvert && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60,
            minWidth: "max-content",
            background: "linear-gradient(180deg, #2d1d5d 0%, #150826 100%)",
            border: "1px solid rgba(255,217,61,.45)",
            borderRadius: 8, padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,.55)",
            display: "flex", flexDirection: "column", gap: 2,
          }}
        >
          {options.map((o) => {
            const active = o.value === valeur;
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => { if (!o.disabled) { onChange(o.value); setOuvert(false); } }}
                title={o.hint || undefined}
                style={{
                  background: active ? "rgba(255,217,61,.18)" : "transparent",
                  color: o.disabled ? "rgba(255,255,255,.28)" : (active ? "#FFD93D" : "#fffaee"),
                  border: "none", borderRadius: 5, padding: "4px 9px",
                  fontSize: ".7rem", fontFamily: "inherit", textAlign: "left",
                  fontWeight: active ? 700 : 400,
                  cursor: o.disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 7,
                  // L'icône d'une option désactivée s'éteint avec son
                  // libellé : sans ça, une destination interdite reste la
                  // ligne la plus colorée de la liste.
                  opacity: o.disabled ? 0.45 : 1,
                }}
              >
                {o.icone}
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* `vue` découpe ce fichier en deux panneaux indépendants, sans le scinder en
   deux fichiers qui partageraient de toute façon la moitié de leurs données :
   · "scoring" — le décompte seul,
   · "journal" — le journal d'actions seul,
   · "tout"    — les deux à la suite, comme avant.
   Les deux premiers sont montés en superposition par-dessus le plateau (cf.
   GameView), le troisième sert encore à l'écran de fin de partie, où il n'y a
   plus de plateau à protéger et où tout doit se lire d'un trait. */
export default function DecisionPanels({ vm, vue = "tout" }) {
  // Journal d'actions : replie par defaut. Sur une partie d'1h30 il grossit
  // sans fin et poussait le reste de la page vers le bas, alors qu'on ne le
  // consulte que ponctuellement pour verifier ce qui vient de se passer.
  // Déplié d'emblée quand le journal EST le panneau qu'on vient d'ouvrir :
  // demander un second clic pour voir ce qu'on est venu chercher n'a de sens
  // que dans le flux, où le repli protégeait la place du plateau.
  const [showLog, setShowLog] = React.useState(vue === "journal");
  // Le cadre et le titre appartiennent à la feuille qui nous porte (cf.
  // Superposition) dès qu'on n'est plus dans le flux.
  const enSuperposition = vue !== "tout";
  /* Filtre du journal par Titan (Nikola, 2026-08-24 : « journal d'actions
     filtrable par Titan » — tout etait melange). `null` = tout afficher.
     Le rattachement d'une ligne a un Titan reutilise EXACTEMENT la detection
     qui servait deja au code couleur : une seule regle, donc la couleur d'une
     ligne et le filtre ne peuvent pas diverger. */
  const [filtreTitan, setFiltreTitan] = React.useState(null);
  const {
    titanState,
    titanModes,
    titanDisplayName,
    rainbowWinnerId,
    showScoring,
    gameOver,
    vertAssignments,
    vertsValides,
    validerVerts,
    actionLog,
    setActionLog,
    journal,
    nommerLigne,
    titanProfiles,
    profileLabel,
    getVertCount,
    updateVertAssignment,
    finalScoreResult,
    preScoreSansVerts,
    classementFinalPartie,
  } = vm;

  /* ── RÉVÉLATION SIMULTANÉE DES VERTS ──
     Tant qu'un seul Vert reste à placer, aucun score n'est montré : le
     tableau de décompte laisse déduire le placement des autres par simple
     différence, ce qui reviendrait à jouer paravent baissé. Hors fin de
     partie, le panneau n'est qu'un aperçu consultable et rien n'est secret :
     personne n'a encore placé quoi que ce soit. */
  const vertsRestants = titanState.players.reduce(
    (n, t) => n + Math.max(0, getVertCount(t) - (vertAssignments[t.id] || []).filter(Boolean).length),
    0
  );
  const scoresReveles = !gameOver || vertsRestants === 0;
  // Titan dont la fenêtre de placement est ouverte. Un seul à la fois :
  // c'est celui qui tient l'appareil.
  const [placeurOuvert, setPlaceurOuvert] = React.useState(null);

  /* Le libellé d'une ligne de tableau : le pictogramme, puis le nom.
     Ces libellés étaient écrits en émojis, ce que le reste de l'interface a
     abandonné depuis longtemps : un émoji est dessiné par le système et non
     par nous, et à 13 px 💪 et 💥 se ressemblaient. Ces lignes portent donc
     les mêmes pictogrammes que le bandeau des Titans et que le menu des
     Verts, dans les mêmes couleurs. Une piste se reconnaît au même signe
     partout où elle apparaît. */
  const ligneIcone = (icone, nom) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{icone}{nom}</span>
  );

  /* Le nom d'un Titan dans un en-tête de tableau, avec son icône.
     Demande de Nikola du 2026-08-18 : à quatre colonnes de chiffres, le nom
     seul oblige à relire l'en-tête à chaque ligne, alors que l'animal se
     reconnaît d'un coup d'œil — c'est déjà le repère utilisé partout
     ailleurs (bandeau des Titans, plateau, journal). */
  const enTeteTitan = (t) => (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <TitanIcon titanId={t.id} size={22} variant="plain" />
      <span>{titanDisplayName(t.id)}</span>
    </span>
  );

  /* Une case du tableau des Repaires, pendant le placement des Verts :
     « combien de blocs → combien de points (+ ce que rapporterait un de
     plus) ». C'est cette dernière valeur qui décide d'un Vert. */
  const celluleStock = (t, couleur) => {
    const compte = countRepaireColors(t)[couleur];
    const pts = scoreBloc(couleur, compte);
    // L'Orange ne marque que par paires : le bloc utile est le second, pas
    // le suivant. Annoncer « +0 » sur un compte impair serait exact mais
    // trompeur — c'est justement là qu'un Vert vaut le plus.
    const gain = scoreBloc(couleur, compte + 1) - pts;
    return (
      <span
        title={`${compte} bloc(s) = ${pts} pt(s)${gain > 0 ? ` · un bloc de plus en rapporterait ${gain}` : " · un bloc de plus ne rapporterait rien"}`}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}
      >
        <strong style={{ color: compte === 0 ? "rgba(255,255,255,.3)" : "#fffaee", fontVariantNumeric: "tabular-nums" }}>
          {compte}
        </strong>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: ".9em" }}>→</span>
        <span style={{ color: pts > 0 ? "#FFD93D" : "rgba(255,255,255,.3)", fontVariantNumeric: "tabular-nums" }}>{pts}</span>
        {/* Point 4.3 du 2026-08-19 : « supprimer l'affichage confus des "+" a
            cote des chiffres durant la phase de placement des Verts ».

            La ligne affichait « 3 -> 5 (+2) » : trois nombres cote a cote dont
            deux comptent des choses differentes (des blocs, des points) et le
            troisieme un gain hypothetique. Au moment ou l'on place ses Verts,
            c'est-a-dire quand on lit ce tableau le plus attentivement, ce
            troisieme nombre se confondait avec le score.

            Le gain marginal n'est pas perdu : il reste dans l'infobulle
            ci-dessus, en toutes lettres, ou il est explique au lieu d'etre
            juxtapose. */}
      </span>
    );
  };

  /* Une case du tableau de barème : « combien de blocs → combien de points ».
     Le compte affiché est celui qui SERT AU CALCUL, Vert affecté compris, et
     il est mis en évidence quand un Vert l'a fait monter — c'est là que se
     joue la différence que Nikola ne voyait pas. */
  const celluleBareme = (t, couleur) => {
    const compte = finalScoreResult.adjCounts[t.id][couleur];
    const base = countRepaireColors(t)[couleur];
    const pts = finalScoreResult.baremeScores[t.id][couleur];
    const boostéParVert = compte > base;
    return (
      <span
        title={boostéParVert
          ? `${base} bloc(s) ramassé(s) + ${compte - base} Vert affecté ici → ${pts} pts`
          : `${compte} bloc(s) → ${pts} pts`}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}
      >
        <strong style={{
          color: compte === 0 ? "rgba(255,255,255,.3)" : boostéParVert ? "#7ef2a8" : "#fffaee",
          fontVariantNumeric: "tabular-nums",
        }}>
          {compte}
        </strong>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: ".9em" }}>→</span>
        <span style={{ color: pts > 0 ? "#FFD93D" : "rgba(255,255,255,.3)", fontVariantNumeric: "tabular-nums" }}>
          {pts}
        </span>
      </span>
    );
  };

  /* Une Piste ADN : « où j'en suis → ce que ça rapporte ». La position est
     celle qui SERT AU CALCUL, Vert placé compris, et le Vert est signalé —
     c'est le seul endroit où un Vert envoyé sur une piste devient visible. */
  const cellulePiste = (t, piste, pts) => {
    const valeur = finalScoreResult.adjADN[t.id][piste];
    const base = t[piste] || 0;
    const boostéParVert = valeur > base;
    return (
      <span
        title={boostéParVert
          ? `Piste à ${base} + ${valeur - base} Vert placé ici → ${pts} pts de classement`
          : `Piste à ${valeur} → ${pts} pts de classement`}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}
      >
        <strong style={{
          color: valeur === 0 ? "rgba(255,255,255,.3)" : boostéParVert ? "#7ef2a8" : "#fffaee",
          fontVariantNumeric: "tabular-nums",
        }}>
          {valeur}
        </strong>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: ".9em" }}>→</span>
        <span style={{ color: pts > 0 ? "#FFD93D" : "rgba(255,255,255,.3)", fontVariantNumeric: "tabular-nums" }}>{pts}</span>
      </span>
    );
  };

  /* Socles : « combien de pièces → combien de points ». Le nombre décide du
     trophée Collectionneur, la valeur décide du score, et les deux se lisent
     donc sur la même ligne. */
  const celluleSocles = (t) => {
    const nb = (t.socles || []).length;
    const pts = finalScoreResult.socleTotal[t.id];
    return (
      <span
        title={nb > 0 ? `${nb} Socle(s) — valeurs : ${t.socles.join(" + ")} = ${pts} pts` : "Aucun socle"}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}
      >
        <strong style={{ color: nb === 0 ? "rgba(255,255,255,.3)" : "#fffaee", fontVariantNumeric: "tabular-nums" }}>{nb}</strong>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: ".9em" }}>→</span>
        <span style={{ color: pts > 0 ? "#FFD93D" : "rgba(255,255,255,.3)", fontVariantNumeric: "tabular-nums" }}>{pts}</span>
      </span>
    );
  };

  /* ── UNE LIGNE DU JOURNAL ──
     Le liseré coloré épais à gauche disait « quelqu'un », jamais « qui » : à
     quatre Titans, quatre traits de 3 px de couleurs voisines ne se
     distinguent pas au premier coup d'œil. L'animal du Titan, lui, se
     reconnaît sans réfléchir — c'est déjà le repère utilisé sur le plateau,
     dans la bande de ressources et au décompte. */
  const LigneJournal = ({ line, titanId, recente }) => {
    const c = titanId && TITAN_COLORS[titanId] ? TITAN_COLORS[titanId].accent : null;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 7,
          padding: "5px 0",
          borderTop: `1px solid ${T.rule}`,
          color: recente ? T.text : T.dim,
          fontSize: T.micro,
          lineHeight: 1.45,
        }}
      >
        {titanId ? (
          <TitanIcon titanId={Number(titanId)} size={16} variant="plain" />
        ) : (
          <span aria-hidden="true" style={{ width: 16, flexShrink: 0 }} />
        )}
        <span style={{ minWidth: 0, borderLeft: c ? `1px solid ${c}` : "none", paddingLeft: c ? 6 : 0 }}>
          {line}
        </span>
      </div>
    );
  };

  return <>
      {/* Le décompte passe AVANT le journal : sur grand écran les deux vivent
          dans la colonne de droite, qui défile pour elle-même, et le journal
          repoussait sous la ligne de flottaison le panneau qu'on venait tout
          juste d'ouvrir (Nikola : « je dois défiler vers le bas pour voir le
          score »). Ce qu'on demande s'affiche en premier. */}
      {/* ── SCORING FINAL ── */}
      {vue !== "journal" && showScoring && (
        <div style={enSuperposition ? { fontSize: T.small } : {
          background: T.plate, border: `2px solid ${T.you}`,
          borderRadius: T.rPlate, padding: "14px 16px", marginBottom: 12, fontSize: T.small,
        }}>
          {/* En superposition, la feuille porte déjà le titre et le cadre :
              les redoubler affichait « Décompte — aperçu » deux fois de suite,
              et emboîtait deux bordures pour rien. */}
          {!enSuperposition && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <Icon name="lantern" size={19} style={{ color: T.you }} />
              <h2 style={marquee(T.h3, T.you)}>
                {gameOver ? "Décompte final" : "Décompte — aperçu"}
              </h2>
            </div>
          )}
          {/* Les deux pavés qui expliquaient ici le sort des Blocs Verts ont
              été retirés (Nikola) : ils poussaient le tableau — la seule chose
              qu'on vient chercher — sous la ligne de flottaison du panneau. La
              règle qu'ils énonçaient reste appliquée et reste dite, mais là où
              on agit : le décompte se masque tout seul tant qu'un Vert n'est
              pas placé, et c'est le placeur lui-même qui l'annonce. */}

          {/* ── PLACEMENT SECRET DES BLOCS VERTS ──
              Il n'est proposé qu'à la FIN de la partie. Il s'ouvrait jusqu'ici
              sur le simple bouton « 🏆 Scoring », consultable à tout moment :
              cliquer dessus en Manche 2 faisait placer aux IA des Verts
              calculés sur un plateau qui n'était pas le plateau final, et ce
              placement n'était plus jamais recalculé. */}
          {gameOver && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#22C55E", fontWeight: 700, marginBottom: 6, fontSize: ".76rem" }}>
              Placement secret des Blocs Verts
            </div>
            {/* PERSONNE NE VOIT LE CHOIX DES AUTRES — demande de Nikola du
                2026-08-18 : « il ne faut pas qu'on sache où les IA ou les
                joueurs ont joué leur Vert, on a l'information seulement après
                que tous les joueurs aient fait leur choix. »

                C'est la règle du livret — placement derrière paravent, révélé
                simultanément — et l'écran la contredisait de deux façons : la
                ligne des IA annonçait leur placement en clair dès qu'il était
                calculé, et les menus déroulants des humains restaient tous
                ouverts côte à côte, chacun affichant le choix du précédent à
                celui qui prenait l'appareil ensuite.

                Chaque Titan a donc désormais SA fenêtre, ouverte par un
                bouton et refermée par « C'est placé ». Une fois fermée, la
                ligne ne dit plus que « placés », comme des cartes retournées
                sur la table. */}
            {titanState.players.map((t) => {
              const vertCount = getVertCount(t);
              if (vertCount === 0) return null;
              const owned = countRepaireColors(t);
              const estIA = titanModes[t.id] === "ia";
              const poses = (vertAssignments[t.id] || []).filter(Boolean).length;
              const complet = poses >= vertCount;
              // `fini` ne veut plus dire « les menus sont remplis » mais
              // « c'est validé, on n'y revient pas » (Nikola, 2026-08-28).
              const fini = !!vertsValides?.[t.id];
              const ouvert = placeurOuvert === t.id;
              return (
                <div key={t.id} style={{
                  border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
                  padding: "7px 9px", marginBottom: 6,
                  background: ouvert ? "rgba(34,197,94,.1)" : "transparent",
                }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <TitanIcon titanId={t.id} size={18} variant="plain" />
                    <strong style={{ color: "#FFD93D", fontSize: ".74rem" }}>{titanDisplayName(t.id)}</strong>
                    <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.5)" }}>
                      {vertCount} Vert{vertCount > 1 ? "s" : ""}
                    </span>
                    {fini && scoresReveles ? (
                      // Révélation : le détail n'apparaît qu'ici, une fois
                      // que plus personne ne peut s'en servir pour décider.
                      <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                        {(vertAssignments[t.id] || []).filter(Boolean).map((a, i) => (
                          <span key={i} style={{
                            background: "rgba(34,197,94,.16)", border: "1px solid rgba(34,197,94,.45)",
                            borderRadius: 6, padding: "2px 7px",
                          }}>
                            {a.type === "color" ? `Barème ${BLOCK_NAME[a.target] || a.target}` : `Piste ${a.target}`}
                          </span>
                        ))}
                      </span>
                    ) : fini ? (
                      <span style={{ fontSize: ".72rem", color: "#7ef2a8", fontWeight: 700, marginLeft: "auto" }}>
                        {estIA ? "🤖 placés, secret" : "✔ placés, secret"}
                      </span>
                    ) : estIA ? (
                      <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.5)", marginLeft: "auto" }}>en cours…</span>
                    ) : ouvert ? (
                      <button
                        onClick={() => { validerVerts(t.id); setPlaceurOuvert(null); }}
                        disabled={!complet}
                        title={complet
                          ? "Valide définitivement : ton placement ne pourra plus être modifié."
                          : `Place tes ${vertCount} Vert${vertCount > 1 ? "s" : ""} avant de valider.`}
                        style={{ ...smallBtn(complet, "#16E08C", "#00C97A"), marginLeft: "auto" }}
                      >
                        ✔ Valider — définitif
                      </button>
                    ) : (
                      <button
                        onClick={() => setPlaceurOuvert(t.id)}
                        style={{ ...smallBtn(true, "#22C55E", "#16A34A"), marginLeft: "auto" }}
                      >
                        ▶ Placer mes Verts
                      </button>
                    )}
                  </div>
                  {ouvert && !estIA && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
                      {Array.from({ length: vertCount }).map((_, i) => (
                        <MenuDA
                          key={i}
                          valeur={vertAssignments[t.id]?.[i] ? `${vertAssignments[t.id][i].type}:${vertAssignments[t.id][i].target}` : ""}
                          placeholder={`Vert #${i + 1}…`}
                          onChange={(v) => updateVertAssignment(t.id, i, v)}
                          /* CHAQUE DESTINATION PORTE SON PICTOGRAMME (Nikola,
                             2026-08-27 : « dans le menu déroulant des Verts,
                             utilise bien les icônes bloc pour les
                             catégories »).

                             La liste n'énonçait que des noms — « Barème
                             Habitation », « Barème Boutique » — alors que
                             tout le reste de l'écran désigne une couleur par
                             son bloc isométrique : le tableau des Repaires
                             juste en dessous, le bandeau des Titans, le
                             plateau. Il fallait retraduire un nom de
                             destination en couleur, de tête, à la seconde où
                             l'on tranche le dernier geste de la partie.

                             Les deux Pistes ADN prennent leurs pictogrammes
                             de piste, ceux du bandeau : gant de boxe et
                             explosion, dans leurs couleurs. */
                          options={[
                            ...["bleu", "rose", "orange", "rouge"].map((c) => ({
                              value: `color:${c}`,
                              icone: <BlockIcon color={c} size={17} />,
                              label: `Barème ${BLOCK_NAME[c]}${owned[c] < 1 ? " (0 bloc)" : ""}`,
                              disabled: owned[c] < 1,
                              hint: owned[c] < 1 ? "Un Vert ne rejoint une couleur que si tu en possèdes déjà au moins une." : undefined,
                            })),
                            { value: "adn:bagarre", icone: <Icon name="brawl" size={15} style={{ color: T.stop }} />, label: "Piste Bagarre +1" },
                            { value: "adn:destruction", icone: <Icon name="wreck" size={15} style={{ color: T.warn }} />, label: "Piste Destruction +1" },
                          ]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {titanState.players.every((t) => getVertCount(t) === 0) && (
              <div style={{ color: "rgba(255,255,255,.4)" }}>Aucun Vert collecté.</div>
            )}
          </div>
          )}

          {/* ── CE QUE CHACUN A DANS SON REPAIRE ──
              Remonté par Nikola le 2026-08-18 : « je dois bien voir combien
              ils ont de blocs, c'est important pour me projeter pour les
              choix des Verts. »

              Le Repaire est PUBLIC : le cacher pendant le placement n'aurait
              protégé aucun secret, et sans lui le choix se fait à l'aveugle.
              Seule l'AFFECTATION des Verts est secrète. Chaque case donne le
              compte, les points qu'il vaut, et ce que rapporterait un bloc de
              plus — c'est exactement la question que pose un Vert en main.
              Le tableau disparaît une fois les scores révélés : le tableau de
              décompte dit alors la même chose, en mieux. */}
          {gameOver && vertsRestants > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: ".72rem", marginBottom: 5 }}>
                Repaires, à cet instant. Survole une case pour savoir ce que rapporterait un bloc de plus.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".74rem" }}>
                <thead>
                  <tr style={{ color: "#FFD93D" }}>
                    <th style={{ padding: "3px 8px", textAlign: "left" }}></th>
                    {titanState.players.map((t) => <th key={t.id} style={{ padding: "3px 8px" }}>{enTeteTitan(t)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {["bleu", "rose", "orange", "rouge"].map((couleur) => (
                    <tr key={couleur} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <BlockIcon color={couleur} size={18} />{BLOCK_NAME[couleur]}
                        </span>
                      </td>
                      {titanState.players.map((t) => (
                        <td key={t.id} style={{ padding: "3px 8px", textAlign: "center" }}>{celluleStock(t, couleur)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <BlockIcon color="vert" size={18} />{BLOCK_NAME.vert}
                      </span>
                    </td>
                    {titanState.players.map((t) => (
                      <td key={t.id} style={{ padding: "3px 8px", textAlign: "center", color: "#7ef2a8" }}>{getVertCount(t)}</td>
                    ))}
                  </tr>
                  {[
                    [ligneIcone(<Icon name="socle" size={17} style={{ color: T.dim }} />, "Socles"), (t) => (t.socles || []).length],
                    [ligneIcone(<Icon name="brawl" size={15} style={{ color: T.stop }} />, "Bagarre"), (t) => t.bagarre || 0],
                    [ligneIcone(<Icon name="wreck" size={15} style={{ color: T.warn }} />, "Destruction"), (t) => t.destruction || 0],
                    [ligneIcone(<AdrenalineIcon size={15} />, "Adrénaline"), (t) => t.adrenaline || 0],
                  ].map(([label, fn], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>{label}</td>
                      {titanState.players.map((t) => (
                        <td key={t.id} style={{ padding: "3px 8px", textAlign: "center" }}>{fn(t)}</td>
                      ))}
                    </tr>
                  ))}
                  {/* ── PRÉ-SCORE, VERTS EXCLUS ──
                      Nikola, 2026-08-27 : « au moment du placement des Verts,
                      j'ai besoin de savoir les pré-scores des autres sans leur
                      Vert pour mieux me projeter. »

                      Les lignes au-dessus disent ce que chacun DÉTIENT. Celle-ci
                      dit ce que ça VAUT : quatre barèmes, le bonus Rose, les
                      Socles, deux classements de piste et l'Adrénaline,
                      additionnés pour quatre Titans. C'est le calcul que
                      personne ne fait de tête à la table, et c'est pourtant
                      celui qui décide où va un Vert : rattraper deux points ou
                      en creuser dix ne se jouent pas au même endroit.

                      Aucun secret n'est éventé : ce total ne contient le Vert
                      de personne, pas même celui de qui le lit. C'est aussi la
                      photo sur laquelle les IA tranchent leur propre
                      placement, depuis le même jour. */}
                  {preScoreSansVerts && (() => {
                    const meilleur = Math.max(
                      ...titanState.players.map((x) => preScoreSansVerts.totals[x.id].total)
                    );
                    return (
                      <tr style={{ background: "rgba(255,217,61,.08)" }}>
                        <td style={{ padding: "5px 8px", color: T.you, fontWeight: 700 }}>
                          Pré-score (Verts exclus)
                        </td>
                        {titanState.players.map((t) => {
                          const total = preScoreSansVerts.totals[t.id].total;
                          const ecart = total - meilleur;
                          return (
                            <td
                              key={t.id}
                              title={ecart === 0
                                ? "En tête avant les Verts"
                                : `${-ecart} point(s) derrière le meilleur pré-score`}
                              style={{ padding: "5px 8px", textAlign: "center", cursor: "help" }}
                            >
                              <strong style={{ color: T.you, fontVariantNumeric: "tabular-nums" }}>{total}</strong>
                              {/* L'écart au meneur, en petit : c'est lui qu'on
                                  cherche quand on place un Vert, pas le total
                                  absolu. */}
                              <span style={{
                                marginLeft: 5, fontSize: ".85em",
                                color: ecart === 0 ? "#7ef2a8" : "rgba(255,255,255,.45)",
                                fontVariantNumeric: "tabular-nums",
                              }}>
                                {ecart === 0 ? "meneur" : ecart}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {finalScoreResult && scoresReveles && (
            <div style={{ overflowX: "auto" }}>
              {/* ── COMBIEN DE BLOCS, PAS SEULEMENT COMBIEN DE POINTS ──
                  Remonté par Nikola le 2026-08-18 : « au scoring final avec
                  les Verts, je n'ai pas de visuel clair sur les quantités de
                  blocs de chaque Titan — j'ai 0 chez l'orange, mais peut-être
                  qu'il en a 1, et donc le Vert en plus fait la différence. »

                  Le tableau n'affichait que des POINTS. Or l'Orange ne marque
                  que par paires : 1 bloc vaut 0 point, exactement comme 0
                  bloc. Impossible, à l'écran, de savoir si un Vert allait
                  compléter une paire à 5 points ou se perdre. Même angle mort
                  au seuil de chaque barème.

                  Chaque case porte donc le NOMBRE de blocs comptés (Vert
                  affecté compris) et le score qu'il produit. Un compte gonflé
                  par un Vert est signalé, pour qu'on voie d'où vient l'écart. */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".74rem" }}>
                <thead>
                  <tr style={{ color: "#FFD93D" }}>
                    <th style={{ padding: "3px 8px", textAlign: "left" }}></th>
                    {titanState.players.map((t) => <th key={t.id} style={{ padding: "3px 8px" }}>{enTeteTitan(t)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="bleu" size={18} />{BLOCK_NAME.bleu}</span>, (t) => celluleBareme(t, "bleu"), "bleu"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rose" size={18} />{BLOCK_NAME.rose}</span>, (t) => celluleBareme(t, "rose"), "rose"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="orange" size={18} />{BLOCK_NAME.orange}</span>, (t) => celluleBareme(t, "orange"), "orange"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rouge" size={18} />{BLOCK_NAME.rouge}</span>, (t) => celluleBareme(t, "rouge"), "rouge"],
                    ["Bonus Rose +10", (t) => finalScoreResult.totals[t.id].roseBonus || "—"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <img src={`${import.meta.env.BASE_URL}assets/rules/socle.png`} alt="" aria-hidden="true"
                        style={{ width: 18, height: 18, objectFit: "contain", filter: "brightness(1.2)" }} />
                      Socles
                    </span>,
                    // Même lecture que les barèmes de couleur : combien de
                    // pièces, puis combien de points. Le total seul laissait
                    // croire à un écart de NOMBRE là où il n'y avait qu'un
                    // écart de valeur, alors que c'est bien le nombre qui
                    // décide du trophée Collectionneur, ligne suivante.
                    (t) => celluleSocles(t)],
                    [ligneIcone(<Icon name="socle" size={17} style={{ color: T.dim }} />, "Collectionneur"), (t) => finalScoreResult.totals[t.id].collectionneurBonus || "—"],
                    [ligneIcone(<RainbowIcon size={17} />, "Arc-en-ciel"), (t) => rainbowWinnerId === t.id ? 5 : "—"],
                    // Les Pistes ADN ne donnaient que des POINTS de podium :
                    // impossible de vérifier le classement à l'œil, et un
                    // Vert placé sur une piste devenait invisible. On montre
                    // la position sur la piste, puis ce qu'elle rapporte.
                    [ligneIcone(<Icon name="brawl" size={15} style={{ color: T.stop }} />, "Bagarre"), (t) => cellulePiste(t, "bagarre", finalScoreResult.totals[t.id].bagarrePts)],
                    [ligneIcone(<Icon name="wreck" size={15} style={{ color: T.warn }} />, "Destruction"), (t) => cellulePiste(t, "destruction", finalScoreResult.totals[t.id].destructionPts)],
                    /* Le barème est LU, jamais recopié : la ligne annonçait « ×3 »
                       après le ruling du 2026-08-19 qui l'avait passé à 2, et
                       promettait donc une valeur d'Adrénaline que le décompte
                       juste en dessous ne payait pas. Depuis le 2026-08-28 il
                       n'y a plus de multiplicateur du tout — la réserve suit un
                       barème progressif, qu'on montre en entier plutôt que de
                       le résumer par un nombre qui n'existe pas. */
                    [ligneIcone(<AdrenalineIcon size={15} />, `Adrénaline ${BAREME_ADRENALINE.join(" · ")}`), (t) => finalScoreResult.totals[t.id].adrenalinePts],
                  ].map(([label, fn], rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>{label}</td>
                      {titanState.players.map((t) => <td key={t.id} style={{ padding: "3px 8px", textAlign: "center" }}>{fn(t)}</td>)}
                    </tr>
                  ))}
                  <tr style={{ background: "rgba(255,217,61,.1)", fontWeight: 700 }}>
                    <td style={{ padding: "5px 8px", color: "#FFD93D" }}>TOTAL</td>
                    {(() => {
                      // Retour de Nikola : le bloc "Classement final" séparé
                      // prenait trop de place pendant le placement des Verts.
                      // Fusionné dans cette ligne TOTAL : la médaille (or,
                      // argent, bronze) suit le classement départagé du
                      // livret (Adrénaline, puis Socle le plus haut, puis
                      // Force des cartes non jouées), sans texte en plus.
                      const rangParId = {};
                      (classementFinalPartie || []).forEach((ligne) => { rangParId[ligne.id] = ligne.rang; });
                      const medaille = { 1: "🥇 ", 2: "🥈 ", 3: "🥉 " };
                      return titanState.players.map((t) => (
                        <td key={t.id} style={{ padding: "5px 8px", color: "#FFD93D", textAlign: "center" }}>
                          {medaille[rangParId[t.id]] || ""}{finalScoreResult.totals[t.id].total}
                        </td>
                      ));
                    })()}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── RÉVÉLATION DES PROFILS D'IA ──
              Placée volontairement TOUT EN BAS, et conditionnée à ce que
              chaque Vert soit déjà affecté (demande explicite de Nikola).
              Apprendre qu'un adversaire est un Expert Agressif pendant
              qu'on décide encore où poser ses Verts, c'est une
              information qui influencerait ce choix : le placement doit
              rester un pari à l'aveugle jusqu'au bout. */}
          {gameOver && (() => {
            const iaIds = titanState.players.map((t) => t.id).filter((id) => titanModes[id] === "ia");
            if (iaIds.length === 0 || !profileLabel) return null;
            if (!scoresReveles) {
              return (
                <div style={{ marginTop: 12, fontSize: ".7rem", color: "rgba(255,255,255,.4)", fontStyle: "italic" }}>
                  🤖 Les profils des IA seront dévoilés une fois tous les Blocs Verts placés.
                </div>
              );
            }
            return (
              <div style={{
                marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.12)",
              }}>
                <div style={{ color: "#a855f7", fontWeight: 700, marginBottom: 6, fontSize: ".76rem" }}>
                  🤖 Qui étaient les IA
                </div>
                {iaIds.map((id) => (
                  <div key={id} style={{ fontSize: ".74rem", marginBottom: 3 }}>
                    <strong style={{ color: "#FFD93D" }}>{titanDisplayName(id)}</strong>
                    <span style={{ color: "rgba(255,255,255,.6)" }}> — </span>
                    <span style={{ color: "#a855f7", fontWeight: 700 }}>{profileLabel(titanProfiles[id])}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── JOURNAL D'ACTIONS ──
          Retour de Nikola : « comprendre ce qui vient de se passer » est l'une
          des quatre frictions de la partie. Le journal les cumulait toutes :

          · il se lisait du PLUS ANCIEN au plus récent, dans une boîte à
            défilement de 220 px — pour voir ce qui venait d'arriver il fallait
            l'ouvrir, puis descendre jusqu'en bas ;
          · replié, il ne montrait rien du tout, alors que la chaîne de
            réaction qu'on veut relire vient de se produire trois secondes plus
            tôt.

          Il se lit désormais à l'envers, du plus récent au plus ancien, et les
          trois dernières lignes restent visibles en permanence. On voit ce qui
          vient de se passer sans rien ouvrir ; on ouvre pour remonter le
          temps. */}
      {/* UN JOURNAL VIDE DOIT LE DIRE. Dans le flux, ne rien afficher était
          la bonne réponse : le panneau n'existait pas encore, il ne prenait
          pas de place. Ouvert à la demande depuis une commande, le même
          silence donne une feuille blanche qui ressemble à une panne. */}
      {vue === "journal" && actionLog.length === 0 && (
        <p style={{ ...prose(T.faint, T.small), margin: 0 }}>
          Rien ne s'est encore passé dans cette partie — le journal se remplit
          au premier déplacement.
        </p>
      )}
      {vue !== "scoring" && actionLog.length > 0 && (() => {
        /* UNE LIGNE PEUT APPARTENIR À PLUSIEURS TITANS. « Titan 1 prend 1
           Adrénaline à Titan 2 » concerne les deux, et le filtre du Titan 2 doit
           la montrer : c'est chez lui qu'elle fait le plus mal. L'ancienne
           lecture ne gardait que le premier identifiant trouvé. */
        const lignes = journal.filter((e) => !e.separateur);
        const visibles = filtreTitan === null
          ? lignes
          : lignes.filter((l) => l.acteurs.includes(filtreTitan));
        // Du plus récent au plus ancien : c'est le sens dans lequel on
        // consulte un journal de partie.
        const recentesDabord = [...visibles].reverse();
        const apercu = recentesDabord.slice(0, 3);

        /* Découpage en Manches. Le séparateur « — — — Manche N — — — » est
           consommé comme un TITRE : il ouvre le bloc au lieu d'y figurer comme
           une ligne. Tout ce qui précède le premier séparateur appartient à la
           Manche 1, qui n'en a jamais eu — elle commence avec la partie. */
        const segments = (() => {
          const parManche = new Map();
          for (const l of visibles) {
            if (!parManche.has(l.manche)) parManche.set(l.manche, []);
            parManche.get(l.manche).push(l);
          }
          // Du plus récent au plus ancien, dedans comme dehors.
          return [...parManche.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([manche, lgs]) => ({ manche, lignes: [...lgs].reverse() }));
        })();
        const compte = (id) => lignes.filter((l) => l.acteurs.includes(id)).length;

        return (
          <div style={{
            background: "rgba(0,0,0,.34)",
            border: `2px solid ${T.edge}`,
            borderRadius: T.rPlate,
            padding: "9px 12px 4px",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowLog((v) => !v)}
                aria-expanded={showLog}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  textAlign: "left", ...label(T.dim, T.micro),
                }}
              >
                <Icon
                  name="next"
                  size={11}
                  style={{ transform: showLog ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }}
                />
                Journal
                <span style={readout("0.6rem", T.faint)}>{actionLog.length}</span>
              </button>
              {/* FERMER N'EST PAS VIDER — Nikola, 2026-08-18 : « j'aimerais
                  pouvoir fermer les logs d'action sans les vider ». Le seul
                  bouton du bandeau était une croix qui EFFAÇAIT tout
                  l'historique. Les deux gestes sont distincts et nommés, et le
                  plus destructeur n'est plus celui qui porte la croix. */}
              {showLog && (
                <button
                  onClick={() => setActionLog([])}
                  title="Effacer définitivement l'historique de la partie"
                  style={{ ...cancelBtn(), color: T.faint, borderColor: T.rule }}
                >
                  Vider
                </button>
              )}
            </div>

            {/* Filtre par Titan (Nikola, 2026-08-24 : « journal d'actions
                filtrable par Titan »). Le rattachement d'une ligne à un Titan
                réutilise EXACTEMENT la détection qui sert au code couleur :
                une seule règle, donc le filtre et la couleur ne peuvent pas
                diverger. */}
            {showLog && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "9px 0 2px" }}>
                <button
                  onClick={() => setFiltreTitan(null)}
                  style={{
                    ...cancelBtn(),
                    borderColor: filtreTitan === null ? T.text : T.rule,
                    color: filtreTitan === null ? T.text : T.faint,
                  }}
                >
                  Tous
                </button>
                {titanState.players.map((t) => {
                  /* L'identifiant reste un NOMBRE. `journal` construit ses
                     `acteurs` avec `Number(m[1])` ; passer par `String(t.id)`
                     ici comparait "2" a 2, donc `includes` renvoyait toujours
                     faux : filtrer par Titan vidait le journal et le compteur
                     affichait 0 (Nikola, 2026-09-01 : « le journal a un bouton
                     pour filtrer par titan mais affiche 0 informations »). */
                  const id = Number(t.id);
                  const actif = filtreTitan === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setFiltreTitan((prev) => (prev === id ? null : id))}
                      title={titanDisplayName ? titanDisplayName(t.id) : "Titan " + id}
                      style={{
                        ...cancelBtn(),
                        gap: 5,
                        borderColor: actif ? TITAN_COLORS[id]?.accent : T.rule,
                        color: actif ? TITAN_COLORS[id]?.accent : T.faint,
                      }}
                    >
                      <TitanIcon titanId={t.id} size={14} variant="plain" />
                      {compte(id)}
                    </button>
                  );
                })}
              </div>
            )}

            {visibles.length === 0 && (
              <div style={{ ...prose(T.faint, T.micro), padding: "8px 0" }}>
                Aucune ligne pour ce Titan.
              </div>
            )}

            {/* Replié : les trois dernières lignes, toujours là.
                Déplié : tout, du plus récent au plus ancien. */}
            {/* ── SEGMENTATION PAR MANCHE ──
                Nikola, 2026-08-28 : « dans le journal, fais des segmentations
                par manche ».

                Le séparateur existait déjà dans le flux (« — — — Manche N — — — »,
                posé par advanceManche) mais il était rendu comme une ligne
                ordinaire : noyé entre deux résolutions de carte, et surtout
                placé SOUS les lignes qu'il ouvre, puisque le journal se lit du
                plus récent au plus ancien. Il ne servait donc à rien.

                On découpe donc pour de bon, et chaque bloc porte son titre EN
                TÊTE — un intertitre au-dessus des lignes qu'il annonce, comme
                dans n'importe quel compte rendu. */}
            <div style={{
              maxHeight: showLog ? 300 : undefined,
              overflowY: showLog ? "auto" : "visible",
              marginTop: 2,
            }}>
              {(showLog ? segments : [{ manche: null, lignes: apercu }]).map((seg, si) => (
                <div key={seg.manche ?? `apercu-${si}`}>
                  {seg.manche != null && (
                    <div style={{
                      position: "sticky", top: 0, zIndex: 2,
                      background: T.screen,
                      padding: "6px 0 4px",
                      marginTop: si === 0 ? 0 : 6,
                      borderTop: si === 0 ? "none" : `2px solid ${T.ruleStrong}`,
                      ...label(T.you, T.micro),
                    }}>
                      Manche {seg.manche}
                      <span style={{ color: T.faint, marginLeft: 6 }}>
                        ({seg.lignes.length} ligne{seg.lignes.length > 1 ? "s" : ""})
                      </span>
                    </div>
                  )}
                  {seg.lignes.map((l, rang) => (
                    <LigneJournal key={l.i} line={nommerLigne(l.texte)} titanId={l.acteurs[0] ?? null} recente={si === 0 && rang === 0} />
                  ))}
                </div>
              ))}
            </div>

            {!showLog && visibles.length > 3 && (
              <button
                onClick={() => setShowLog(true)}
                style={{
                  ...label(T.faint, "0.68rem"),
                  background: "none", border: "none", padding: "6px 0",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
              >
                + {visibles.length - 3} ligne{visibles.length - 3 > 1 ? "s" : ""} plus tôt
              </button>
            )}
          </div>
        );
      })()}
  </>;
}
