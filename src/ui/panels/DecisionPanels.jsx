import React from "react";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { countRepaireColors } from "../../domain/index.js";
import { smallBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME, scoreBloc } from "../blockNames.js";

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
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DecisionPanels({ vm }) {
  // Journal d'actions : replie par defaut. Sur une partie d'1h30 il grossit
  // sans fin et poussait le reste de la page vers le bas, alors qu'on ne le
  // consulte que ponctuellement pour verifier ce qui vient de se passer.
  const [showLog, setShowLog] = React.useState(false);
  const {
    titanState,
    titanModes,
    titanDisplayName,
    rainbowWinnerId,
    showScoring,
    gameOver,
    vertAssignments,
    actionLog,
    setActionLog,
    titanProfiles,
    profileLabel,
    getVertCount,
    updateVertAssignment,
    finalScoreResult,
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

  return <>
      {/* ── LOG D'ACTIONS ── */}
      {actionLog.length > 0 && (
        <div style={{
          fontSize: ".72rem", background: "rgba(0,0,0,.3)", borderRadius: 10,
          padding: "8px 12px", marginBottom: 12, lineHeight: 1.6,
          maxHeight: showLog ? 220 : undefined, overflowY: showLog ? "auto" : "visible",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowLog((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flex: 1,
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "rgba(255,255,255,.4)", fontSize: ".68rem", fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span>{showLog ? "▲" : "▼"}</span>
              Journal d'actions
              <span style={{ color: "rgba(255,255,255,.28)" }}>({actionLog.length})</span>
            </button>
            {/* FERMER N'EST PAS VIDER — demande de Nikola du 2026-08-18 :
                « j'aimerais pouvoir fermer les logs d'action sans les
                vider ». Le seul bouton du bandeau était une croix qui
                EFFAÇAIT tout l'historique de la partie ; refermer le
                journal demandait de viser le titre lui-même, ce que rien
                n'indiquait. Les deux gestes sont désormais distincts et
                nommés, et le plus destructeur des deux n'est plus celui qui
                porte la croix. */}
            {showLog && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => setShowLog(false)}
                  title="Replier le journal — rien n'est effacé"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.55)", cursor: "pointer", fontSize: ".68rem", fontFamily: "inherit" }}
                >▲ Fermer</button>
                <button
                  onClick={() => setActionLog([])}
                  title="Effacer définitivement l'historique de la partie"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: ".68rem", fontFamily: "inherit" }}
                >🗑 Vider</button>
              </div>
            )}
          </div>
          {showLog && actionLog.map((line, i) => {
            // Bug #10 (tracker) : code couleur par Titan dans les logs —
            // on repère le 1er Titan mentionné ("Titan 3", "T2"…) et on
            // applique sa couleur (TITAN_COLORS) en liseré + texte, pour
            // repérer d'un coup d'œil qui a fait quoi. Lignes neutres
            // (sans Titan identifié, ex. résultats de scoring globaux)
            // gardent le style gris d'origine.
            const m = line.match(/T(?:itan)?\.?\s*(\d)/);
            const titanId = m ? m[1] : null;
            const c = titanId && TITAN_COLORS[titanId] ? TITAN_COLORS[titanId].accent : null;
            return (
              <div key={i} style={{
                color: c || "rgba(255,255,255,.7)",
                borderLeft: c ? `3px solid ${c}` : "3px solid transparent",
                paddingLeft: 6,
              }}>{line}</div>
            );
          })}
        </div>
      )}


      {/* ── SCORING FINAL ── */}
      {showScoring && (
        <div style={{
          background: "rgba(255,217,61,.06)", border: "1.5px solid rgba(255,217,61,.3)",
          borderRadius: 14, padding: "14px 16px", marginBottom: 12, fontSize: ".78rem",
        }}>
          <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1rem", marginBottom: 10 }}>
            {gameOver ? "🏆 Scoring final" : "🏆 Scoring — aperçu"}
          </div>
          {/* Le décompte ne commence pas tant que chaque Vert n'a pas trouvé
              sa catégorie : c'est le dernier geste de la partie, et il était
              invisible tant que l'écran restait enterré sous le plateau. */}
          {gameOver && (
            <div style={{
              background: vertsRestants > 0 ? "rgba(34,197,94,.14)" : "rgba(255,217,61,.12)",
              border: `1.5px solid ${vertsRestants > 0 ? "#22C55E" : "rgba(255,217,61,.5)"}`,
              borderRadius: 10, padding: "8px 12px", marginBottom: 12,
              fontSize: ".78rem", color: "rgba(255,255,255,.8)",
            }}>
              {vertsRestants > 0
                ? <>🟢 <strong style={{ color: "#7ef2a8" }}>Partie terminée.</strong> Il reste {vertsRestants} Bloc{vertsRestants > 1 ? "s" : ""} Vert{vertsRestants > 1 ? "s" : ""} à placer. <strong>Les scores restent cachés</strong> jusqu'à ce que tout le monde ait choisi.</>
                : <>🏁 <strong style={{ color: "#FFD93D" }}>Partie terminée.</strong> Tous les Blocs Verts sont placés, le décompte ci-dessous est définitif.</>}
            </div>
          )}
          {!gameOver && (
            <div style={{
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.15)",
              borderRadius: 10, padding: "8px 12px", marginBottom: 12,
              fontSize: ".74rem", color: "rgba(255,255,255,.6)",
            }}>
              Partie en cours : les Blocs Verts ne sont pas encore placés et ne comptent donc nulle part.
              Ce tableau dit où en est chacun, pas qui gagnera.
            </div>
          )}

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
              const fini = poses >= vertCount;
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
                        onClick={() => setPlaceurOuvert(null)}
                        disabled={poses < vertCount}
                        style={{ ...smallBtn(poses >= vertCount, "#16E08C", "#00C97A"), marginLeft: "auto" }}
                      >
                        ✔ C'est placé
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
                          options={[
                            ...["bleu", "rose", "orange", "rouge"].map((c) => ({
                              value: `color:${c}`,
                              label: `Barème ${BLOCK_NAME[c]}${owned[c] < 1 ? " (0 bloc)" : ""}`,
                              disabled: owned[c] < 1,
                              hint: owned[c] < 1 ? "Un Vert ne rejoint une couleur que si tu en possèdes déjà au moins une." : undefined,
                            })),
                            { value: "adn:bagarre", label: "Piste Bagarre +1" },
                            { value: "adn:destruction", label: "Piste Destruction +1" },
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
                    ["🗿 Socles", (t) => (t.socles || []).length],
                    ["💪 Bagarre", (t) => t.bagarre || 0],
                    ["💥 Destruction", (t) => t.destruction || 0],
                    ["💉 Adrénaline", (t) => t.adrenaline || 0],
                  ].map(([label, fn], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>{label}</td>
                      {titanState.players.map((t) => (
                        <td key={t.id} style={{ padding: "3px 8px", textAlign: "center" }}>{fn(t)}</td>
                      ))}
                    </tr>
                  ))}
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
                    ["🗿 Collectionneur", (t) => finalScoreResult.totals[t.id].collectionneurBonus || "—"],
                    ["🌈 Arc-en-ciel", (t) => rainbowWinnerId === t.id ? 5 : "—"],
                    // Les Pistes ADN ne donnaient que des POINTS de podium :
                    // impossible de vérifier le classement à l'œil, et un
                    // Vert placé sur une piste devenait invisible. On montre
                    // la position sur la piste, puis ce qu'elle rapporte.
                    ["💪 Bagarre", (t) => cellulePiste(t, "bagarre", finalScoreResult.totals[t.id].bagarrePts)],
                    ["💥 Destruction", (t) => cellulePiste(t, "destruction", finalScoreResult.totals[t.id].destructionPts)],
                    ["💉 Adrénaline×3", (t) => finalScoreResult.totals[t.id].adrenalinePts],
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

  </>;
}
