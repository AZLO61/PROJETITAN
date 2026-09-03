import React, { useEffect, useState } from "react";
import CardVisual from "../cards/CardVisual.jsx";
import { CARD_EFFECT } from "../cards/cardEffects.js";
import BlockIcon from "../BlockIcon.jsx";
import Icon, { AdrenalineIcon, RainbowIcon } from "../icons.jsx";
import { T, marquee, label, prose, readout } from "../theme.js";
import { CARD_LABEL, CARD_FORCE } from "../../domain/index.js";

/* ============================================================
   LE TUTORIEL — LE JEU EN SEPT ÉCRANS
   ============================================================
   Nikola, 2026-09-01 : « il faudrait un bouton tutoriel pour voir les
   principes du jeu rapidement, et le fonctionnement des cartes
   visuellement ».

   POURQUOI PAS LA PAGE RÈGLES. Elle existe, elle est complète, et c'est
   exactement son problème : huit sections, un sommaire, le livret V36 entier.
   C'est ce qu'on ouvre pour VÉRIFIER un point pendant une partie. Quelqu'un
   qui s'assoit pour la première fois n'a pas besoin d'une référence, il a
   besoin de savoir quoi faire à son tour — et il ne lira pas huit sections
   pour l'apprendre.

   Les deux ne se remplacent donc pas, et le tutoriel se termine par une porte
   vers les règles : c'est la suite naturelle, pas un doublon.

   UN ÉCRAN À LA FOIS, ET C'EST LA FORME QUI ENSEIGNE. Une page qui déroule
   tout laisse choisir par où commencer, ce qui est précisément ce qu'un
   débutant ne sait pas faire. Sept écrans dans l'ordre du jeu — le but, la
   Manche, le tour, le Périmètre, les cartes, les pistes, la fin — donnent la
   séquence en même temps que le contenu. C'est aussi la seule mise en page
   qui tient sur un téléphone sans devenir un mur de texte.

   LES CARTES SONT MONTRÉES, PAS DÉCRITES. `CardVisual` est le dessin que le
   joueur aura sous les yeux pendant la partie : le reconnaître est la moitié
   de ce qu'il y a à apprendre. Les phrases viennent de `CARD_EFFECT`, celles
   qui s'affichent déjà sous les cartes en jeu — une seule source, donc jamais
   deux formulations pour une même carte.
============================================================ */

function Plaque({ children, accent = T.rule, style }) {
  return (
    <div style={{
      background: "rgba(0,0,0,.26)",
      border: `2px solid ${accent}`,
      borderRadius: T.rPlate,
      padding: "13px 15px",
      ...style,
    }}>
      {children}
    </div>
  );
}

/* Une ligne « pictogramme → phrase ». C'est la forme de presque tout ce
   tutoriel : un signe que le joueur reverra sur le plateau, et ce qu'il veut
   dire. Le signe est celui du jeu, jamais un dessin inventé pour la
   circonstance — sans quoi on apprendrait un vocabulaire à jeter. */
function Point({ icone, titre, children, ton = T.you }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 11 }}>
      <span style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: T.rChip,
        border: `2px solid ${ton}`, display: "grid", placeItems: "center", color: ton,
      }}>
        {icone}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...label(ton, T.small), display: "block", marginBottom: 3 }}>{titre}</span>
        <span style={{ ...prose(T.dim, T.micro), lineHeight: 1.45, display: "block" }}>{children}</span>
      </span>
    </div>
  );
}

const CARTES_ORDRE = [
  "tout_casser", "tete_en_avant", "graouhhh",
  "boing_boing", "faut_pas_me_chauffer", "je_ne_partage_pas",
];

function EcranBut() {
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        Vous êtes des Titans lâchés dans <strong style={{ color: T.you }}>BIG CITY</strong>.
        Vous démolissez la ville, et vous ramassez les morceaux.
      </p>
      <Plaque accent={T.you} style={{ marginBottom: 12 }}>
        <Point icone={<Icon name="smash" size={16} />} titre="Casser">
          Les bâtiments sont des piles de blocs de couleur. Vos cartes les font tomber,
          et les blocs se retrouvent au sol.
        </Point>
        <Point icone={<Icon name="grab" size={16} />} titre="Ramasser" ton={T.go}>
          Un bloc au sol dans votre Périmètre se ramasse. Il part dans votre Repaire,
          et c&apos;est lui qui rapporte des points.
        </Point>
        <Point icone={<RainbowIcon size={17} />} titre="Marquer" ton={T.tele}>
          En fin de partie, chaque couleur a son barème. Les collections complètes et
          les Socles pèsent lourd.
        </Point>
      </Plaque>
      <p style={{ ...prose(T.faint, T.micro), margin: 0, lineHeight: 1.45 }}>
        Se battre n&apos;est pas décoratif : pousser un Titan lui fait perdre des blocs, et
        vous rapporte de la Bagarre. La ville et les autres joueurs sont deux sources de
        points, pas une seule.
      </p>
    </>
  );
}

function EcranManche() {
  const phases = [
    { nom: "Programmation", icone: "card", ton: T.you, texte: "Chacun choisit SECRÈTEMENT 3 cartes parmi les 6 de sa main. Ce seront ses trois coups de la Manche, dans l'ordre qu'il voudra." },
    { nom: "Action", icone: "bolt", ton: T.go, texte: "Chacun joue UNE carte par round, à son tour, en commençant par le Détonateur. Trois rounds, donc trois cartes." },
    { nom: "Repos", icone: "lock", ton: T.tele, texte: "Chacun pioche à l'aveugle une carte chez son voisin. Elle lui est retirée pour la Manche suivante." },
  ];
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        Une partie fait <strong style={{ color: T.you }}>4 Manches à 4 Titans</strong> (6 à trois).
        Chaque Manche déroule toujours les mêmes trois temps.
      </p>
      <div style={{ display: "grid", gap: 9, marginBottom: 12 }}>
        {phases.map((p, i) => (
          <Plaque key={p.nom} accent={p.ton}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ ...readout("0.72rem", "#0f0826"), background: p.ton, width: 22, height: 22, display: "grid", placeItems: "center", flexShrink: 0 }}>
                {i + 1}
              </span>
              <Icon name={p.icone} size={15} style={{ color: p.ton }} />
              <span style={label(p.ton, T.small)}>{p.nom}</span>
            </div>
            <div style={{ ...prose(T.dim, T.micro), lineHeight: 1.45 }}>{p.texte}</div>
          </Plaque>
        ))}
      </div>
      <p style={{ ...prose(T.faint, T.micro), margin: 0, lineHeight: 1.45 }}>
        Le jeton <strong style={{ color: T.you }}>Détonateur</strong> ouvre chaque round et
        passe au Titan suivant à chaque nouvelle Manche.
      </p>
    </>
  );
}

function EcranTour() {
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        À ton tour, tu fais jusqu&apos;à trois choses, <strong style={{ color: T.you }}>dans cet ordre</strong>.
        L&apos;écran ne t&apos;en montre qu&apos;une à la fois.
      </p>
      <Plaque accent={T.move} style={{ marginBottom: 12 }}>
        <Point icone={<Icon name="move" size={16} />} titre="1 · Te déplacer" ton={T.move}>
          Jusqu&apos;à 2 cases, gratuit, et facultatif. Chaque Adrénaline dépensée en ajoute
          une. Te déplacer change ton Périmètre, donc la puissance de ta carte.
        </Point>
        <Point icone={<Icon name="card" size={16} />} titre="2 · Jouer une carte" ton={T.you}>
          Une seule par round, prise parmi tes 3 cartes programmées. Tu peux aussi la
          défausser face cachée : personne ne saura laquelle.
        </Point>
        <Point icone={<Icon name="grab" size={16} />} titre="3 · Ramasser" ton={T.go}>
          Un bloc ou un Socle au choix dans ton Périmètre, une fois par tour, et seulement
          après avoir joué ou défaussé.
        </Point>
      </Plaque>
      <p style={{ ...prose(T.faint, T.micro), margin: 0, lineHeight: 1.45 }}>
        Tu peux revenir en arrière tant que ton tour dure : le bouton
        <strong style={{ color: "#ffb877" }}> Annuler </strong>
        défait tes coups un par un. Il se ferme dès que la main passe au Titan suivant.
      </p>
    </>
  );
}

function EcranPerimetre() {
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        Ton <strong style={{ color: T.you }}>Périmètre</strong>, ce sont les 8 cases qui
        t&apos;entourent. Ton <strong style={{ color: T.you }}>Énergie</strong>, c&apos;est le
        nombre de ces cases qui sont occupées.
      </p>
      <Plaque accent={T.you} style={{ marginBottom: 12 }}>
        <img
          src={`${import.meta.env.BASE_URL}assets/rules/perimetre.png`}
          alt="Les huit cases qui entourent un Titan"
          style={{ display: "block", width: "100%", maxWidth: 260, margin: "0 auto 10px", height: "auto" }}
        />
        <div style={{ ...prose(T.dim, T.micro), lineHeight: 1.45 }}>
          Un bâtiment debout, un tas de débris, un autre Titan : tout ce qui occupe une
          case compte pour 1 d&apos;Énergie. Te déplacer d&apos;une case peut donc doubler la
          puissance de ta carte — ou la vider.
        </div>
      </Plaque>
      <Plaque accent={T.stop}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
          <span style={{ ...label(T.stop, T.small), border: `1.5px solid ${T.stop}`, padding: "2px 6px" }}>
            Seuil 4
          </span>
          <span style={label(T.dim, T.micro)}>le seuil qui change tout</span>
        </div>
        <div style={{ ...prose(T.dim, T.micro), lineHeight: 1.45 }}>
          À partir de 4 d&apos;Énergie, Tout Casser abat aussi les bâtiments, et un Titan
          touché subit un <strong style={{ color: T.stop }}>Dilemme</strong> : il perd un
          bloc. En dessous, il est seulement poussé.
        </div>
      </Plaque>
    </>
  );
}

function EcranCartes() {
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        Six cartes, les mêmes pour tout le monde. Leur <strong style={{ color: T.you }}>Force</strong>
        {" "}ne sert pas à frapper : c&apos;est elle qu&apos;on compare avec Faut Pas Me Chauffer.
      </p>
      <div style={{
        display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))",
      }}>
        {CARTES_ORDRE.map((cardId) => (
          <div key={cardId} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0 }}>
              <CardVisual cardId={cardId} size="small" selectable={false} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={label(T.you, T.small)}>{CARD_LABEL[cardId]}</span>
                <span style={label(T.faint, T.micro)}>Force {CARD_FORCE[cardId]}</span>
              </span>
              <span style={{ ...prose(T.dim, T.micro), lineHeight: 1.45, display: "block" }}>
                {CARD_EFFECT[cardId]}
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function EcranPistes() {
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        Quatre compteurs vivent à côté de ton Repaire. Tu les vois sur ta plaque,
        en haut de l&apos;écran.
      </p>
      <Plaque accent={T.rule}>
        <Point icone={<AdrenalineIcon size={17} />} titre="Adrénaline" ton={T.go}>
          +1 à chaque fin de Manche. Elle s&apos;échange contre de la portée, une case de
          déplacement, une mise cachée — ou le droit de refuser une Fatigue.
        </Point>
        <Point icone={<Icon name="brawl" size={16} />} titre="Bagarre" ton={T.stop}>
          +1 par Titan distinct que tu déplaces avec une carte. Elle rapporte des points
          en fin de partie.
        </Point>
        <Point icone={<Icon name="wreck" size={16} />} titre="Destruction" ton={T.warn}>
          +1 par bloc que tu arraches à un bâtiment, ricochets compris.
        </Point>
        <Point icone={<Icon name="lantern" size={16} />} titre="Lanterne Rouge" ton={T.tele}>
          Le Titan qui a le moins de blocs ramasse 3 éléments au lieu de 2 avec Je Ne
          Partage Pas. C&apos;est le rattrapage du jeu.
        </Point>
      </Plaque>
    </>
  );
}

function EcranFin({ onOuvrirRegles }) {
  const couleurs = ["bleu", "rose", "orange", "rouge", "vert"];
  return (
    <>
      <p style={{ ...prose(T.text, T.body), lineHeight: 1.5, marginTop: 0 }}>
        La partie s&apos;arrête à la fin de la Manche en cours dès qu&apos;une de ces
        conditions tombe — la limite de Manches n&apos;est que l&apos;une des quatre.
      </p>
      <Plaque accent={T.stop} style={{ marginBottom: 12 }}>
        <div style={{ ...prose(T.dim, T.micro), lineHeight: 1.6 }}>
          🏁 Dernière Manche atteinte · 🏙️ trop peu de bâtiments encore debout ·
          📦 une couleur a entièrement disparu du plateau · 🌀 il ne reste qu&apos;un
          Téléporteur actif.
        </div>
      </Plaque>
      <Plaque accent={T.you} style={{ marginBottom: 14 }}>
        <div style={{ ...label(T.you, T.small), marginBottom: 8 }}>Puis on compte</div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 9, flexWrap: "wrap" }}>
          {couleurs.map((c) => <BlockIcon key={c} color={c} size={24} />)}
        </div>
        <div style={{ ...prose(T.dim, T.micro), lineHeight: 1.45 }}>
          Chaque couleur a son barème, et les Verts se placent en secret dans la couleur
          de ton choix, tout à la fin. S&apos;y ajoutent les Socles, la Bagarre, la
          Destruction et le Trophée Arc-en-ciel.
        </div>
      </Plaque>
      {onOuvrirRegles && (
        <button
          onClick={onOuvrirRegles}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "transparent", border: `2px solid ${T.rule}`, borderRadius: T.rChip,
            color: T.dim, padding: "10px 15px", cursor: "pointer",
            fontFamily: T.ui, fontWeight: 700, fontSize: T.small,
          }}
        >
          <Icon name="card" size={14} />
          Le détail de chaque règle est dans le livret
        </button>
      )}
    </>
  );
}

const ETAPES = [
  { id: "but", titre: "Le but", Vue: EcranBut },
  { id: "manche", titre: "Une Manche", Vue: EcranManche },
  { id: "tour", titre: "Ton tour", Vue: EcranTour },
  { id: "perimetre", titre: "Périmètre et Énergie", Vue: EcranPerimetre },
  { id: "cartes", titre: "Les six cartes", Vue: EcranCartes },
  { id: "pistes", titre: "Tes compteurs", Vue: EcranPistes },
  { id: "fin", titre: "Fin de partie", Vue: EcranFin },
];

export default function TutorielPage({ onClose, onOuvrirRegles = null }) {
  const [etape, setEtape] = useState(0);
  const derniere = etape === ETAPES.length - 1;

  /* Échap ferme, les flèches naviguent, et le fond ne défile plus derrière la
     superposition — mêmes conventions que la page Règles, pour qu'on n'ait pas
     deux plein-écrans qui se pilotent différemment. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setEtape((n) => Math.min(ETAPES.length - 1, n + 1));
      if (e.key === "ArrowLeft") setEtape((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);

  const { titre, Vue } = ETAPES[etape];

  return (
    <div
      role="dialog"
      aria-label="Tutoriel"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: T.screen, color: T.text, fontFamily: T.ui,
        display: "flex", flexDirection: "column",
      }}
    >
      <header style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 18px", borderBottom: `2px solid ${T.ruleStrong}`,
        background: "rgba(0,0,0,.3)", flexShrink: 0,
      }}>
        <div style={marquee("1.1rem", T.you)}>Prise en main</div>
        <span style={{ ...label(T.faint, T.micro), border: `2px solid ${T.rule}`, borderRadius: T.rChip, padding: "3px 9px" }}>
          {etape + 1}/{ETAPES.length}
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,.06)",
            border: `2px solid ${T.edge}`, borderRadius: T.rChip,
            color: T.text, padding: "9px 14px", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 7,
            ...label(T.text, T.micro),
          }}
        >
          <Icon name="close" size={14} />
          Fermer
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ ...marquee("1.5rem", T.you), margin: "0 0 14px" }}>{titre}</h2>
          <Vue onOuvrirRegles={onOuvrirRegles} />
        </div>
      </div>

      {/* La barre de navigation est FIXE en bas : sur un téléphone, elle reste
          sous le pouce quelle que soit la longueur de l'écran courant. Les
          pastilles servent aussi de repère de progression — sept écrans, on voit
          où l'on en est sans compter. */}
      {/* DEUX RANGÉES, PAS UNE QUI SE CASSE. Sur 375 px, « Précédent », sept
          pastilles et « Suivant » ne tiennent pas sur une ligne : le `flexWrap`
          empilait les deux boutons l'un sous l'autre, et le pied de page mangeait
          un tiers de l'écran. Les pastilles ont donc leur propre rangée — elles
          disent où l'on en est, pas ce qu'il faut faire — et les deux boutons se
          partagent la seconde, chacun poussé vers son bord. */}
      <footer style={{
        display: "flex", flexDirection: "column", gap: 10,
        padding: "12px 18px", borderTop: `2px solid ${T.ruleStrong}`,
        background: "rgba(0,0,0,.3)", flexShrink: 0,
      }}>
        <span style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {ETAPES.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setEtape(i)}
              aria-label={e.titre}
              aria-pressed={i === etape}
              style={{
                width: i === etape ? 22 : 9, height: 9, borderRadius: 99,
                background: i === etape ? T.you : T.rule,
                border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
                transition: "width 140ms linear, background 140ms linear",
              }}
            />
          ))}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setEtape((n) => Math.max(0, n - 1))}
            disabled={etape === 0}
            style={{
              background: "transparent", border: `2px solid ${etape === 0 ? T.rule : T.edge}`,
              borderRadius: T.rChip, padding: "11px 15px",
              cursor: etape === 0 ? "not-allowed" : "pointer",
              ...label(etape === 0 ? T.faint : T.text, T.micro),
            }}
          >
            Précédent
          </button>

          <button
            onClick={() => (derniere ? onClose() : setEtape((n) => n + 1))}
            style={{
              marginLeft: "auto",
              background: T.you, border: `2px solid ${T.edge}`, borderRadius: T.rChip,
              padding: "11px 17px", cursor: "pointer",
              boxShadow: `0 3px 0 ${T.edge}`,
              ...label("#1a1400", T.micro),
            }}
          >
            {derniere ? "C'est parti" : "Suivant"}
          </button>
        </span>
      </footer>
    </div>
  );
}
