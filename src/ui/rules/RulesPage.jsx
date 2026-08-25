import { useEffect, useState } from "react";
import {
  LEXIQUE, BADGES, PHASES_MANCHE, CARTES,
  BAREMES, BAREME_VERT, TROPHEES, PISTES_ADN, FINS_PARTIE,
} from "./rulesContent.js";
import BlockIcon from "../BlockIcon.jsx";
import { T, marquee, label, prose } from "../theme.js";
import Icon from "../icons.jsx";

/* ============================================================
   PAGE RÈGLES — version numérique du livret V36
   ============================================================
   Affichée en superposition plein écran au-dessus du jeu. Le contrôleur
   n'est jamais démonté : l'état de la partie (plateau, Titans, Manche,
   cartes, pile d'undo) reste intact pendant la consultation, et on
   retrouve exactement la même situation en refermant.

   Direction artistique reprise de la feuille de style du livret V36
   (conservée hors dépôt par Nikola) : mêmes variables de couleur, mêmes familles typographiques, mêmes icônes PNG
   que le livret papier. L'adaptation au numérique porte sur la navigation :
   le livret est un long document à dérouler, ici on passe par un sommaire
   latéral collant et une seule section affichée à la fois, pour retrouver
   une règle en pleine partie sans faire défiler trois écrans.
============================================================ */

/* ── LE LIVRET EST DANS LE MÊME MEUBLE ──
   Il gardait la feuille de style du livret papier V36 : dégradés violets,
   gélules arrondies à 999 px, et « Bangers » en titre — une police qui n'a
   jamais été chargée. Retour de Nikola : « le livret fait un peu tache dans
   sa direction artistique maintenant ». C'était le dernier écran resté dans
   l'ancien monde.

   Les NOMS de la palette ne bougent pas (ils servent une centaine de fois
   ici), seules les valeurs pointent désormais sur les jetons de la borne.
   Les couleurs de repère du livret — jaune, magenta, vert, teal — sont
   conservées : ce sont les mêmes signaux que dans le jeu. */
const C = {
  p2: T.screen, p3: T.plate, p4: T.plateHi,
  y1: T.you, m1: T.stop, g1: T.go, teal: "#2DD4BF",
  cream: T.text, ink: "#0f0826", muted: T.dim,
};

const SECTIONS = [
  { id: "essentiel", label: "L'essentiel", icon: "bolt" },
  { id: "manche", label: "Structure d'une Manche", icon: "undo" },
  { id: "permanentes", label: "Tes 2 règles permanentes", icon: "move" },
  { id: "cartes", label: "Les 6 Cartes Actions", icon: "card" },
  { id: "transversales", label: "Règles transversales", icon: "smash" },
  { id: "lexique", label: "Lexique", icon: "eye" },
  { id: "scoring", label: "Scoring final", icon: "lantern" },
  { id: "fin", label: "Fin de partie", icon: "alert" },
];

function Panel({ children, glow, style }) {
  return (
    <div style={{
      background: glow ? "rgba(255,217,61,.07)" : "rgba(0,0,0,.26)",
      border: `2px solid ${glow ? T.you : T.rule}`,
      borderRadius: T.rPlate, padding: "16px 18px", ...style,
    }}>
      {children}
    </div>
  );
}

// Le sur-titre au-dessus du titre a été retiré partout : le titre porte son
// propre poids, et la section est déjà nommée dans le sommaire de gauche.
// Le paramètre `eyebrow` reste accepté et ignoré, pour ne pas avoir à
// retoucher les huit appels.
function Title({ children }) {
  return (
    <>
      {/* 'Bangers' n'a jamais été chargée non plus : ce titre s'affichait donc
          dans une police de repli, penchée par certains navigateurs qui
          synthétisent l'italique. Il prend la police du fronton, comme tous
          les titres du jeu. */}
      <h2 style={{ ...marquee("clamp(1.4rem, 3.4vw, 2rem)", C.y1), margin: "0 0 16px" }}>
        {children}
      </h2>
    </>
  );
}

function Sub({ children }) {
  return (
    <h3 style={{ ...marquee("1rem", C.cream), margin: "26px 0 10px" }}>
      {children}
    </h3>
  );
}

function Badge({ code, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: T.rChip,
      background: color, color: C.ink, border: `2px solid ${T.edge}`,
      fontWeight: 800, fontSize: ".72rem",
      letterSpacing: ".06em", verticalAlign: "middle",
    }}>
      {code}
    </span>
  );
}

export default function RulesPage({ onClose }) {
  const [section, setSection] = useState("essentiel");

  // Échap ferme la page, et le fond ne défile plus derrière la superposition.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Règles du jeu"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: T.screen,
        color: C.cream, fontFamily: T.ui,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* ── EN-TÊTE ── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 18px", borderBottom: `2px solid ${T.ruleStrong}`,
        background: "rgba(0,0,0,.3)", flexShrink: 0,
      }}>
        <div style={marquee("1.3rem", C.y1)}>Projet Titan</div>
        <span style={{
          ...label(C.muted, T.micro),
          border: `2px solid ${T.rule}`,
          borderRadius: T.rChip, padding: "3px 9px",
        }}>
          Livret V36
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto", background: C.m1,
            border: `2px solid ${T.edge}`, borderRadius: T.rChip,
            color: "#fffaee", padding: "10px 16px", cursor: "pointer",
            boxShadow: `0 3px 0 ${T.edge}`,
            display: "inline-flex", alignItems: "center", gap: 7,
            ...label("#fffaee", T.micro),
          }}
        >
          <Icon name="close" size={14} />
          Retour à la partie
        </button>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── SOMMAIRE ── */}
        <nav style={{
          flexShrink: 0, overflowY: "auto", padding: "12px 10px",
          borderRight: `2px solid ${T.rule}`,
          background: "rgba(0,0,0,.22)", minWidth: 62,
        }}>
          {SECTIONS.map((s) => {
            const active = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                title={s.label}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: active ? C.p4 : "transparent",
                  border: `2px solid ${active ? C.y1 : "transparent"}`,
                  borderRadius: T.rChip,
                  padding: "10px 11px", marginBottom: 4, cursor: "pointer",
                  textAlign: "left",
                  ...label(active ? C.y1 : C.muted, T.micro),
                }}
              >
                <Icon name={s.icon} size={16} />
                {/* Le libellé disparaît sous 720px : le sommaire devient une
                    colonne d'icônes, pour laisser la place au contenu. */}
                <span className="rules-nav-label">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── CONTENU ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "22px clamp(14px, 4vw, 40px) 60px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            {section === "essentiel" && <SectionEssentiel />}
            {section === "manche" && <SectionManche />}
            {section === "permanentes" && <SectionPermanentes />}
            {section === "cartes" && <SectionCartes />}
            {section === "transversales" && <SectionTransversales />}
            {section === "lexique" && <SectionLexique />}
            {section === "scoring" && <SectionScoring />}
            {section === "fin" && <SectionFin />}
          </div>
        </main>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .rules-nav-label { display: none; }
        }
      `}</style>
    </div>
  );
}

/* ── SECTIONS ────────────────────────────────────────────── */

function SectionEssentiel() {
  return (
    <>
      <Title eyebrow="🧬 L'histoire">L'ORIGINE DES TITANS</Title>
      <Panel glow style={{ fontSize: "1rem", lineHeight: 1.7 }}>
        Issus d'expériences scientifiques poussées toujours plus loin, vous étiez
        censés rester sous contrôle. La dernière a mal tourné. Vous vous êtes
        échappés. Et maintenant, vous comptez bien{" "}
        <strong style={{ color: C.y1 }}>tout casser dans BIG CITY</strong>.
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12, marginTop: 16 }}>
        <Panel>
          <div style={{ fontSize: ".72rem", color: C.m1, fontWeight: 700, marginBottom: 4 }}>🎯 VOTRE MISSION</div>
          Raser la ville et écraser vos adversaires. Le plus haut score l'emporte, le reste s'effondre.
        </Panel>
        <Panel>
          <div style={{ fontSize: ".72rem", color: C.m1, fontWeight: 700, marginBottom: 4 }}>⏱️ FORMAT</div>
          <strong style={{ color: C.y1 }}>3 à 4 joueurs</strong>, <strong style={{ color: C.y1 }}>1h30 à 2h</strong>, 10 ans et plus.
        </Panel>
      </div>

      <Sub>Le principe</Sub>
      <Panel>
        Chaque Manche, tu programmes <strong style={{ color: C.y1 }}>3 cartes face cachée</strong> parmi
        les 6 de ta main. Tu les révèles une par une, à tour de rôle. Chaque carte détruit
        du bâtiment, projette des blocs ou bouscule les autres Titans. Tu ramasses ce que
        tu casses, et tu marques à la fin.
      </Panel>

      <Sub>Durée</Sub>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Panel style={{ flex: 1, minWidth: 160, textAlign: "center" }}>
          <div style={{ fontFamily: "'Titan One', sans-serif", fontSize: "1.8rem", color: C.y1 }}>6</div>
          <div style={{ fontSize: ".78rem", color: C.muted }}>Manches à 3 joueurs</div>
        </Panel>
        <Panel style={{ flex: 1, minWidth: 160, textAlign: "center" }}>
          <div style={{ fontFamily: "'Titan One', sans-serif", fontSize: "1.8rem", color: C.y1 }}>4</div>
          <div style={{ fontSize: ".78rem", color: C.muted }}>Manches à 4 joueurs</div>
        </Panel>
      </div>
    </>
  );
}

function SectionManche() {
  return (
    <>
      <Title eyebrow="🔄 Le rythme">STRUCTURE D'UNE MANCHE</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PHASES_MANCHE.map((p) => (
          <Panel key={p.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: T.rChip,
              background: C.p4,
              border: `1px solid ${C.y1}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Titan One', sans-serif", color: C.y1, fontSize: "1rem",
            }}>
              {p.n}
            </div>
            <div>
              <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".92rem", color: C.cream, marginBottom: 3 }}>
                {p.nom}
              </div>
              <div style={{ fontSize: ".86rem", color: C.muted, lineHeight: 1.5 }}>{p.texte}</div>
            </div>
          </Panel>
        ))}
      </div>

      <Panel glow style={{ marginTop: 16 }}>
        <strong style={{ color: C.y1 }}>💪 Adrénaline :</strong> tu en gagnes 1 à chaque début de Manche.
        Entre chaque Manche, le Jeton Détonateur passe au joueur suivant dans le sens horaire.
      </Panel>

      <Sub>Le Repos en détail</Sub>
      <Panel style={{ marginBottom: 10 }}>
        <strong style={{ color: C.teal }}>Vol de carte —</strong> dans le sens du Détonateur, chaque Titan
        choisit 1 carte parmi les 3 jouées du Titan suivant et la pose face visible dans sa zone Repos.
        La cible peut dépenser 1 Adrénaline pour annuler ce vol.
      </Panel>
      <Panel>
        <strong style={{ color: C.teal }}>Restitution —</strong> les cartes placées en zone Repos à la
        Manche précédente reviennent en main de leur propriétaire.
      </Panel>

      <Panel style={{ marginTop: 16, borderColor: `${C.m1}55`, background: `${C.m1}12` }}>
        <strong style={{ color: C.m1 }}>⚠️ Carte inapplicable —</strong> si une carte programmée ne peut
        pas être exécutée, ou si tu ne veux finalement pas l'utiliser, elle reste face cachée. Aucune
        information n'est donnée aux adversaires, mais elle compte comme ta carte du tour.
      </Panel>
    </>
  );
}

function SectionPermanentes() {
  return (
    <>
      <Title eyebrow="🧡 Toujours disponibles">TES 2 RÈGLES PERMANENTES</Title>
      <p style={{ color: C.muted, marginTop: -8, marginBottom: 16 }}>
        Les deux sont <strong style={{ color: C.y1 }}>optionnelles</strong> : tu n'es jamais obligé de les utiliser.
      </p>

      <Panel style={{ marginBottom: 12, borderColor: "rgba(113,219,255,.35)", background: "rgba(113,219,255,.07)" }}>
        <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#71dbff", marginBottom: 6 }}>
          🦶 Mouvement gratuit — avant ta carte
        </div>
        Déplace ton Titan de <strong style={{ color: C.y1 }}>2 cases</strong> (+1 par Adrénaline dépensée).
        Le déplacement se fait dans les 8 directions, mais ne traverse ni un Titan ni un bâtiment.
        Seul un Téléporteur actif est traversable.
        <div style={{ marginTop: 8, fontSize: ".82rem", color: C.muted }}>
          Ton Périmètre, donc ton Énergie, change après chaque déplacement. Recompte avant de jouer.
        </div>
        <div style={{ marginTop: 8, fontSize: ".82rem", color: C.muted }}>
          🥊 Si tu rentres de <strong style={{ color: C.m1 }}>hors de BIG CITY</strong> ce tour-ci,
          ta rentrée se paie ici : <strong style={{ color: C.y1 }}>1 case en moins</strong>, et 1 de
          plus par obstacle à contourner. Il te reste donc 1 case, et il faut dépenser une
          Adrénaline pour retrouver ta marge.
        </div>
      </Panel>

      <Panel style={{ borderColor: "rgba(22,224,140,.35)", background: "rgba(22,224,140,.07)" }}>
        <div style={{ fontFamily: "'Bowlby One', sans-serif", color: C.g1, marginBottom: 6 }}>
          🤲 Récupération — après ta carte
        </div>
        Ramasse <strong style={{ color: C.y1 }}>1 Bloc ou 1 Socle</strong> au choix dans ton Périmètre.
        <div style={{ marginTop: 8, fontSize: ".82rem", color: C.muted }}>
          Si la case ramassée se retrouve entièrement vide, tu es obligé de t'y déplacer.
        </div>
      </Panel>
    </>
  );
}

function SectionCartes() {
  return (
    <>
      <Title eyebrow="🎴 Le deck">LES 6 CARTES ACTIONS</Title>
      <Panel glow style={{ marginBottom: 18 }}>
        <strong style={{ color: C.y1 }}>Valeurs de Force :</strong> Tout Casser 1 · Tête en Avant 2 ·
        Graouhhh 2 · Boing Boing 2 · Faut Pas Me Chauffer 3 · Je Ne Partage Pas 3.
        <div style={{ marginTop: 6, fontSize: ".84rem", color: C.muted }}>
          La Force sert au calcul de Faut Pas Me Chauffer : on additionne les 3 cartes de ta Manche.
        </div>
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {CARTES.map((c) => (
          <div key={c.num} style={{
            background: `color-mix(in srgb, ${c.couleur} 16%, rgba(0,0,0,.3))`,
            border: `1px solid ${c.couleur}55`, borderRadius: T.rPlate, padding: "16px 18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: "2rem", lineHeight: 1 }}>{c.icon}</div>
              <div>
                <div style={{ fontSize: ".68rem", color: C.muted, letterSpacing: ".1em" }}>{c.num}</div>
                <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: "1.05rem", color: c.couleur }}>
                  {c.nom}
                </div>
              </div>
              <span style={{
                marginLeft: "auto", background: "rgba(0,0,0,.3)", border: `1px solid ${c.couleur}`,
                borderRadius: T.rChip, padding: "3px 12px", fontSize: ".76rem", color: C.cream, fontWeight: 700,
              }}>
                ⚡ Force {c.force}
              </span>
            </div>

            <div style={{ fontSize: ".92rem", marginBottom: 10, lineHeight: 1.55 }}>{c.resume}</div>

            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              {c.effets.map((e, i) => (
                <li key={i} style={{ fontSize: ".86rem", color: C.muted, lineHeight: 1.5 }}>{e}</li>
              ))}
            </ul>

            {c.note && (
              <div style={{
                marginTop: 11, paddingTop: 9, borderTop: "1px dashed rgba(255,255,255,.14)",
                fontSize: ".82rem", color: C.cream,
              }}>
                {c.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function SectionTransversales() {
  return (
    <>
      <Title eyebrow="💥 L'âme du jeu">RÈGLES TRANSVERSALES</Title>

      <Sub>L'Énergie et le Seuil 4</Sub>
      <Panel glow>
        Ton <strong style={{ color: C.y1 }}>Énergie</strong> se calcule au moment où tu joues ta carte :
        c'est le nombre de cases occupées dans ton Périmètre, plafonné à 8. Une case est occupée par
        un bâtiment encore debout ou par un autre Titan.
        <div style={{ marginTop: 10 }}>
          À <strong style={{ color: C.m1 }}>4 ou plus</strong>, tu passes le{" "}
          <strong style={{ color: C.m1 }}>Seuil 4</strong> : c'est lui qui débloque les effets les plus
          forts (RAGE, Patatras, Écroulement, et la casse d'un bâtiment par ricochet).
        </div>
        <div style={{ marginTop: 10, fontSize: ".85rem", color: C.muted }}>
          1 Adrénaline dépensée peut faire basculer le Seuil au moment décisif.
        </div>
      </Panel>

      <Sub>Arrêt faute de puissance et projection</Sub>
      <Panel style={{ marginBottom: 10 }}>
        <strong style={{ color: C.teal }}>Arrêt faute de puissance —</strong> un élément qui percute
        un bâtiment ou atteint le bord du plateau sans l'énergie du Seuil 4 s'arrête net, sur une
        case adjacente à la fois à celle où il se trouvait et à celle qu'il visait (ou sur place,
        au bord du plateau, faute de case au-delà). Il ne repart plus en sens inverse.
      </Panel>
      <Panel style={{ marginBottom: 10 }}>
        <strong style={{ color: C.teal }}>Projection —</strong> un <strong>Titan</strong> qui arrive
        sur une case occupée pousse ce qui s'y trouve, d'un nombre de cases égal à l'énergie
        restante. La chaîne peut se poursuivre indéfiniment, jusqu'à épuisement de l'énergie
        transmise.
        <div style={{ marginTop: 10 }}>
          <strong style={{ color: C.y1 }}>Un Titan pousse toujours un autre Titan</strong>, même
          s'il ne lui reste qu'une énergie de 1 : il le décale alors d'une case. Deux Titans ne
          partagent jamais une case, il faut donc bien que l'un cède. Chaque Titan{" "}
          <strong>distinct</strong> déplacé rapporte 1 Bagarre à l'initiateur — et un Titan déjà en
          mouvement dans la réaction n'est jamais poussé une seconde fois.
        </div>
        <div style={{ marginTop: 10 }}>
          <strong style={{ color: C.g1 }}>Un débris, lui, ne pousse pas :</strong> le béton qui
          rencontre du béton s'arrête dessus et forme un Amas. Bloc + Bloc = Amas, Bloc + Amas =
          Amas. Seule la cible directement frappée par une carte est projetée.
        </div>
      </Panel>
      <Panel style={{ marginBottom: 10 }}>
        <strong style={{ color: C.m1 }}>🥊 Poussé hors du ring —</strong> un Titan projeté au-delà du
        bord quitte BIG CITY et ne revient qu'au début de son propre tour. Il réapparaît{" "}
        <strong style={{ color: C.y1 }}>de l'autre côté</strong> : seul l'axe par lequel il est
        SORTI boucle, l'autre garde la coordonnée que sa trajectoire lui donne. Sorti plein est en
        C9, il rentre par C1 ; poussé au nord-ouest depuis H1, il sort par la colonne et rentre en
        G9 ; sorti par un coin, où les deux axes dépassent en même temps, il rentre par le coin
        opposé. Si la case est prise, il longe le rebord jusqu'à la première case libre. Il rentre
        toujours, et cette rentrée lui coûte 1 déplacement de son Mouvement gratuit.
      </Panel>
      <Panel glow style={{ marginBottom: 10 }}>
        <strong style={{ color: C.y1 }}>Ricochet destructeur —</strong> si un élément percute un
        bâtiment avec une énergie de <strong style={{ color: C.m1 }}>4 ou plus</strong>, il lui casse
        1 bloc au lieu de s'arrêter net. L'élément percutant s'arrête, et c'est le bloc cassé qui repart
        dans la direction du choc. En dessous du Seuil 4, le bâtiment fait mur comme avant.
      </Panel>
      <Panel>
        <strong style={{ color: C.teal }}>🌀 Faille spatio-temporelle —</strong> un élément qui sort du
        plateau avec une énergie de 4 ou plus ressort par le bord opposé et poursuit sa trajectoire.
      </Panel>

      <Sub>Socles</Sub>
      <Panel>
        Le Socle est posé sous chaque bâtiment à sa construction, et sa valeur est{" "}
        <strong style={{ color: C.y1 }}>fixe</strong> : elle ne change pas quand le bâtiment perd des blocs.
        Quand un bâtiment est entièrement vidé, son Socle tombe au sol de BIG CITY et devient un
        élément libre, ramassable comme un Bloc de béton.
        <div style={{ marginTop: 10, fontSize: ".85rem", color: C.muted }}>
          Un Socle libéré n'est attribué à personne automatiquement, y compris quand la destruction
          vient d'un ricochet : il reste au sol, et le premier qui le ramasse le garde.
        </div>
      </Panel>

      <Sub>Téléporteurs</Sub>
      <Panel>
        Les 5 bâtiments Téléporteur ont un bloc Vert à leur base et font au moins 3 étages. Tant que
        ce bloc Vert n'est pas collecté, le Téléporteur est actif et traversable pendant un mouvement.
        Un bâtiment Téléporteur entièrement détruit est un Téléporteur consommé.
      </Panel>
    </>
  );
}

function SectionLexique() {
  return (
    <>
      <Title eyebrow="📖 Les termes">LEXIQUE</Title>
      <p style={{ color: C.muted, marginTop: -8, marginBottom: 18 }}>
        Les icônes ci-dessous sont celles du plateau et des cartes.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))", gap: 12 }}>
        {LEXIQUE.map((l) => (
          <Panel key={l.nom} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img
              src={l.icon} alt=""
              style={{ width: 46, height: 46, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))" }}
            />
            <div>
              <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".82rem", color: C.y1, marginBottom: 3 }}>
                {l.nom}
              </div>
              <div style={{ fontSize: ".8rem", color: C.muted, lineHeight: 1.45 }}>{l.def}</div>
            </div>
          </Panel>
        ))}
      </div>

      <Sub>Les 2 décisions</Sub>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 12 }}>
        {BADGES.map((b) => (
          <Panel key={b.code}>
            <div style={{ marginBottom: 6 }}>
              <Badge code={b.code} color={b.color} />{" "}
              <strong style={{ color: C.cream, fontSize: ".88rem" }}>{b.nom}</strong>
            </div>
            <div style={{ fontSize: ".84rem", color: C.muted, lineHeight: 1.5 }}>{b.def}</div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function SectionScoring() {
  return (
    <>
      <Title eyebrow="🏆 La fin">SCORING FINAL</Title>
      <Panel glow style={{ textAlign: "center", fontFamily: "'Bowlby One', sans-serif", fontSize: "clamp(.8rem, 2.4vw, 1rem)", color: C.y1, marginBottom: 18 }}>
        SCORE = Blocs + Socles + Trophées + Pistes ADN + Adrénaline
      </Panel>

      <Sub>Barème par couleur</Sub>
      <p style={{ color: C.muted, marginTop: -4, marginBottom: 14, fontSize: ".88rem" }}>
        Compte tes blocs d'une couleur, puis lis les points sur la case correspondante.
      </p>

      {/* Une carte par couleur plutôt qu'un tableau à trois colonnes : le
          tableau imposait 520px de large, débordait sur téléphone, et
          écrasait le barème en une seule chaîne « 1 · 3 · 5 · 7 · 10 ».
          Chaque palier a maintenant sa case, avec le nombre de blocs en
          dessous du score, et l'icône du bloc du jeu en tête de carte. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {BAREMES.map((b) => (
          <div key={b.key} style={{
            background: `${b.hex}12`, border: `1px solid ${b.hex}44`,
            borderRadius: T.rPlate, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <BlockIcon color={b.key} size={30} />
              <div>
                <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".95rem", color: b.hex }}>
                  {b.type}
                </div>
                <div style={{ fontSize: ".76rem", color: C.muted }}>
                  {b.couleur} · {b.stock} blocs en jeu
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {b.paliers.map((pts, i) => (
                <div key={i} style={{
                  minWidth: 52, textAlign: "center",
                  background: "rgba(0,0,0,.28)", border: `1px solid ${b.hex}55`,
                  borderRadius: T.rChip, padding: "6px 8px",
                }}>
                  <div style={{
                    fontFamily: "'Titan One', sans-serif", fontSize: "1.1rem", color: b.hex,
                    lineHeight: 1.1,
                  }}>
                    {pts}
                  </div>
                  <div style={{ fontSize: ".66rem", color: C.muted, whiteSpace: "nowrap" }}>
                    {b.paliersLabel ? b.paliersLabel[i] : `${i + 1} bloc${i > 0 ? "s" : ""}`}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: ".82rem", color: C.muted, lineHeight: 1.5 }}>
              {b.detail}
            </div>
          </div>
        ))}

        {/* Le Vert n'a pas de barème : il se traite à part. */}
        <div style={{
          background: `${BAREME_VERT.hex}12`, border: `1px solid ${BAREME_VERT.hex}44`,
          borderRadius: T.rPlate, padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <BlockIcon color={BAREME_VERT.key} size={30} />
            <div>
              <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".95rem", color: BAREME_VERT.hex }}>
                {BAREME_VERT.type}
              </div>
              <div style={{ fontSize: ".76rem", color: C.muted }}>
                {BAREME_VERT.couleur} · {BAREME_VERT.stock} blocs en jeu
              </div>
            </div>
          </div>
          <div style={{ fontSize: ".86rem", lineHeight: 1.55 }}>
            {BAREME_VERT.detail}
          </div>
          <div style={{ marginTop: 10, fontSize: ".82rem", color: C.muted, lineHeight: 1.5 }}>
            Le choix se fait bloc par bloc, en secret derrière le paravent, sans restriction de
            répartition. Il devient définitif à la révélation, et ne peut pas dépasser le maximum
            d'un barème.
          </div>
        </div>
      </div>

      <Sub>Trophées</Sub>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 12 }}>
        {TROPHEES.map((t) => (
          <Panel key={t.nom}>
            <div style={{ fontFamily: "'Bowlby One', sans-serif", color: C.y1, marginBottom: 4 }}>
              {t.icon} {t.nom} <span style={{ color: C.g1 }}>{t.pts}</span>
            </div>
            <div style={{ fontSize: ".82rem", color: C.muted, lineHeight: 1.45 }}>{t.def}</div>
          </Panel>
        ))}
      </div>

      <Sub>Pistes ADN — classement final</Sub>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {PISTES_ADN.map((p) => (
          <Panel key={p.rang} style={{ flex: 1, minWidth: 110, textAlign: "center" }}>
            <div style={{ fontSize: ".82rem", color: C.muted }}>{p.rang}</div>
            <div style={{ fontFamily: "'Titan One', sans-serif", fontSize: "1.4rem", color: C.y1 }}>{p.pts}</div>
          </Panel>
        ))}
      </div>
      <Panel>
        <strong style={{ color: C.y1 }}>⚖️ Classements séparés :</strong> Bagarre et Destruction sont
        classées indépendamment l'une de l'autre. En cas d'égalité sur une piste, les ex aequo
        reçoivent tous les points du rang inférieur partagé. Deux premiers ex aequo touchent donc
        chacun +3, pas +7.
      </Panel>
    </>
  );
}

function SectionFin() {
  return (
    <>
      <Title eyebrow="🛑 Le dénouement">FIN DE PARTIE</Title>
      <Panel glow style={{ marginBottom: 16 }}>
        La partie s'arrête <strong style={{ color: C.y1 }}>à la fin de la Manche en cours</strong>,
        jamais en plein tour, dès que le nombre maximum de Manches est atteint ou qu'une des trois
        conditions ci-dessous est remplie sur le plateau.
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {FINS_PARTIE.map((f) => (
          <Panel key={f.nom} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ fontSize: "1.6rem", lineHeight: 1, flexShrink: 0 }}>{f.icon}</div>
            <div>
              <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".92rem", color: C.y1, marginBottom: 4 }}>
                {f.nom}
              </div>
              <div style={{ fontSize: ".86rem", color: C.muted, lineHeight: 1.5 }}>{f.def}</div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
