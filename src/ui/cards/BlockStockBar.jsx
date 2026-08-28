import React from "react";
import { COLOR_HEX, STOCK_INITIAL } from "../../domain/gameRules.js";
import { BLOCK_NAME, BLOCK_ORDER } from "../blockNames.js";
import BlockIcon from "../BlockIcon.jsx";

// ============================================================
// ÉTAT DU PLATEAU — ce qu'il reste de blocs, et rien d'autre
// ============================================================
// Trois panneaux disaient l'état du plateau : une barre de jauges en haut,
// une liste de chiffres dans les stats du bas, et un encart « Partie ».
// Tout avait été réuni ici, au-dessus du plateau.
//
// TROP RÉUNI. Une première ligne y avait fini par empiler l'avancement de
// Manche, le nom du Détonateur, le compte de bâtiments, son seuil, et quatre
// pastilles de validation. Nikola, 2026-08-27 : « supprime toute cette
// barre ». Elle disait cinq choses différentes sur une seule rangée de
// 0,68 rem, dont trois étaient déjà écrites ailleurs à l'écran — la Manche et
// le Détonateur dans le fronton, la validation sur la plaque de chaque Titan.
//
// Ce qui n'était écrit nulle part ailleurs a déménagé, chacun à sa place :
// · le compte de bâtiments et son seuil montent au fronton, avec la Manche —
//   c'est le second compte à rebours de la partie ;
// · l'ordre de passage des Titans descend sur les plaques elles-mêmes
//   (cf. TitanResourceBand), là où on lit déjà qui joue.
//
// Il ne reste ici que ce que ce panneau sait dire seul : les blocs encore en
// jeu, couleur par couleur.
//
// Le nom de chaque bloc n'est plus écrit : il tient dans l'infobulle, la
// couleur et l'icône suffisent à l'identifier en un coup d'œil. Écrire
// « Habitation », « Supermarché » sur cinq lignes remplissait le panneau
// d'un texte qu'on ne lit qu'une fois.
//
// L'icône de bloc est le composant partagé BlockIcon : même volume que dans
// la vue 3D, dans tous les panneaux.

function StockItem({ color, label, remaining, total, alert, compact = false }) {
  const pct = total > 0 ? remaining / total : 0;
  /* En mode compact (rangée de commandes), la jauge disparaît : à cette taille
     elle ne dit rien que le rapport chiffré ne dise déjà, et c'est elle qui
     imposait deux lignes de hauteur. L'icône et le compte suffisent. */
  if (compact) {
    return (
      <span
        title={`${label} — ${remaining} sur ${total}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}
      >
        {/* +20 % puis +30 % de plus, tous deux à l'essai (Nikola, 2026-08-28).
            À 23 px d'icône et 1,05 rem de compte, c'est désormais le stock qui
            fixe la hauteur de la rangée de commandes — d'où le `flex-start` sur
            les touches, qui restent à leur taille au lieu de s'étirer avec
            lui. */}
        <BlockIcon color={color} size={23} />
        <span style={{
          fontSize: "1.05rem", fontWeight: 700, lineHeight: 1,
          color: alert ? "#ef4444" : "rgba(255,255,255,.8)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {remaining}<span style={{ opacity: .45 }}>/{total}</span>
        </span>
      </span>
    );
  }
  return (
    <div
      title={`${label} — ${remaining} sur ${total}`}
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "help" }}
    >
      <BlockIcon color={color} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 42 }}>
        <span style={{
          fontSize: ".68rem", fontWeight: 700, lineHeight: 1,
          color: alert ? "#ef4444" : "rgba(255,255,255,.8)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {remaining}<span style={{ opacity: .45 }}>/{total}</span>
        </span>
        <div style={{
          width: 42, height: 5, borderRadius: 3,
          background: "rgba(255,255,255,.12)", overflow: "hidden",
        }}>
          <div style={{
            width: "100%", height: "100%",
            transform: `scaleX(${pct})`, transformOrigin: "left center",
            background: alert ? "#ef4444" : COLOR_HEX[color],
            transition: "transform .3s ease-out",
          }} />
        </div>
      </div>
    </div>
  );
}

/* `orientation` — quatre emplacements essayés en une journée, et c'est le
   quatrième qui est le bon.

   Au-dessus du plateau, il prenait une rangée à la colonne large. Dans la
   colonne des commandes, il volait une hauteur qui manquait au dernier panneau.
   En pleine largeur au-dessus des colonnes, il coûtait encore 48 px de hauteur
   à un écran qui doit tout montrer sans défiler. Nikola, 2026-08-28 : « je veux
   que "stock global" soit sur la même ligne que les boutons Scoring, Vue 3D,
   Règles, Journal, mais à droite — je veux que tout rentre sur 1 écran sans
   défilement ».

   C'est la seule position qui ne coûte RIEN : la rangée de commandes existe
   déjà, elle est haute de 34 px, et sa moitié droite est vide. Le mode "rangee"
   s'y glisse donc sans cadre, sans fond et sans jauges — juste les comptes,
   alignés à droite, à la hauteur d'une commande.

   Les trois modes :
   · "ligne"  — cadre autonome, jauges complètes (hérité, plus utilisé en jeu) ;
   · "colonne" — deux colonnes compactes (hérité) ;
   · "rangee" — en ligne dans la rangée de commandes, sans habillage. */
export default function BlockStockBar({ board, looseBlocks, orientation = "ligne" }) {
  const enColonne = orientation === "colonne";
  const dansLaRangee = orientation === "rangee";
  const onBoard = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
  Object.values(board).forEach((b) =>
    b.blocks.forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; })
  );
  Object.values(looseBlocks).forEach((stack) =>
    (stack || []).forEach((c) => { if (onBoard[c] !== undefined) onBoard[c]++; })
  );
  const activeTele = Object.values(board).filter((b) => b.isTeleporter && b.blocks.length > 0).length;
  const totalTele = Object.values(board).filter((b) => b.isTeleporter).length;

  const jauges = (
    <>
      {BLOCK_ORDER.map((c) => (
        <StockItem
          key={c}
          color={c}
          label={BLOCK_NAME[c]}
          remaining={onBoard[c]}
          total={STOCK_INITIAL[c]}
          alert={onBoard[c] === 0}
          compact={dansLaRangee}
        />
      ))}
      <StockItem
        color="vert"
        label={`${BLOCK_NAME.vert} actifs`}
        remaining={activeTele}
        total={totalTele}
        alert={activeTele <= 1}
        compact={dansLaRangee}
      />
    </>
  );

  /* Dans la rangée de commandes : pas de cadre, pas de fond, pas de marge — il
     ne doit rien coûter en hauteur. `marginLeft: auto` le pousse à droite, dans
     la moitié vide de la rangée. */
  if (dansLaRangee) {
    return (
      <div
        title="Béton encore sur le plateau, couleur par couleur"
        style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}
      >
        {jauges}
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(0,0,0,.22)", borderRadius: 10,
      padding: enColonne ? "9px 11px" : "8px 12px", marginBottom: 10,
    }}>
      {/* Ce qu'il reste de béton sur le plateau, couleur par couleur. */}
      <div style={enColonne
        ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "7px 10px" }
        : { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {jauges}
      </div>
    </div>
  );
}
