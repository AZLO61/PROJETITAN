import React, { useState } from "react";
import { T, marquee, readout, label, prose } from "./theme.js";
import Icon from "./icons.jsx";
import { TitanIcon } from "./titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "./titans/constants.js";
import { creerSession, rejoindreSession } from "../net/session.js";
import { btnStyle, smallBtn, cancelBtn } from "./styles.js";

/* ============================================================
   JOUER À DISTANCE — LE PANNEAU DE L'ÉCRAN D'ACCUEIL
   ============================================================
   Nikola, 2026-08-29 : « pouvoir jouer avec des joueurs à distance en donnant
   un ID de session et son mot de passe ».

   Trois écrans, et un seul à la fois — c'est un formulaire d'arcade, pas un
   tableau de bord :

     · le choix    ouvrir une table, ou en rejoindre une ;
     · le salon    l'hôte voit qui arrive et donne les Titans ;
     · l'attente   l'invité voit son siège et patiente.

   L'ADRESSE DU RELAIS EST DEMANDÉE UNE FOIS ET RETENUE. C'est la seule chose
   pénible de ce montage — une URL de tunnel change à chaque redémarrage — et
   la retenir dans le navigateur évite de la retaper à chaque partie. Elle n'a
   rien de secret : c'est le mot de passe qui garde la porte, pas l'adresse.
============================================================ */

const CLE_RELAIS = "titan.relais.url";
const CLE_PSEUDO = "titan.relais.pseudo";

function lireMemoire(cle, defaut = "") {
  /* Un navigateur en navigation privée, ou réglé pour bloquer le stockage, fait
     LEVER une exception à la simple lecture — pas seulement rendre null. Sans
     ce filet, l'écran d'accueil ne s'afficherait pas du tout. */
  try { return window.localStorage.getItem(cle) ?? defaut; } catch { return defaut; }
}
function ecrireMemoire(cle, valeur) {
  try { window.localStorage.setItem(cle, valeur); } catch { /* tant pis */ }
}

export default function PanneauDistant({
  session, distantJoueurs, distantSieges, distantAvis,
  nbJoueurs, titanNames, titanModes,
  onBrancherSession, onQuitterSession, onPublierSieges,
  onLancer,
}) {
  const [ecran, setEcran] = useState("ferme");   // ferme | choix | creer | rejoindre
  const [urlRelais, setUrlRelais] = useState(() => lireMemoire(CLE_RELAIS));
  const [pseudo, setPseudo] = useState(() => lireMemoire(CLE_PSEUDO, "Nikola"));
  const [motDePasse, setMotDePasse] = useState("");
  const [idSalle, setIdSalle] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const champ = {
    background: "rgba(0,0,0,.45)", color: T.text,
    border: `2px solid ${T.rule}`, borderRadius: T.rChip,
    padding: "9px 11px", fontFamily: T.ui, fontSize: T.body,
    fontWeight: 600, outline: "none", width: "100%", boxSizing: "border-box",
  };

  async function agir(quoi) {
    setOccupe(true);
    setErreur(null);
    try {
      ecrireMemoire(CLE_RELAIS, urlRelais);
      ecrireMemoire(CLE_PSEUDO, pseudo);
      const s = quoi === "creer"
        ? await creerSession({ urlRelais, motDePasse, pseudo })
        : await rejoindreSession({ urlRelais, id: idSalle, motDePasse, pseudo });
      onBrancherSession(s);
      setMotDePasse("");     // il ne traîne pas dans un champ après usage
      /* On N'ENTRE PAS dans la partie ici. L'invité reste sur cet écran, en
         attente, et c'est le premier instantané de l'hôte marqué « partie
         lancée » qui le fait basculer. Entrer tout de suite lui montrait un
         plateau généré chez lui, remplacé une seconde plus tard : il croyait
         que la partie avait commencé sans lui. */
    } catch (e) {
      setErreur(e.message || "Impossible de joindre le relais.");
    } finally {
      setOccupe(false);
    }
  }

  /* ── L'INVITÉ : IL ATTEND, ET C'EST TOUT ── */
  if (session && session.siege === "invite") {
    return (
      <div style={{
        border: `2px solid ${T.tele}`, borderRadius: T.rPlate,
        padding: "12px 14px", marginBottom: 20, background: "rgba(184,140,255,.08)",
      }}>
        <div style={{ ...marquee(".9rem", T.tele), marginBottom: 6 }}>
          Connecté à la table {session.id}
        </div>
        <p style={{ ...prose(T.dim, T.small), margin: "0 0 8px" }}>
          En attente de l&apos;hôte : c&apos;est lui qui distribue les Titans et
          lance la partie. Tu entreras automatiquement.
        </p>
        <button onClick={onQuitterSession} style={cancelBtn()}>Quitter la table</button>
      </div>
    );
  }

  /* ── L'HÔTE : LE SALON ── */
  if (session && session.siege === "hote") {
    const invites = (distantJoueurs || []).filter((j) => j.siege === "invite");
    const donnerSiege = (titanId, ref) => {
      const suite = { ...distantSieges };
      // Un joueur ne tient qu'un Titan : on libère son siège précédent.
      Object.keys(suite).forEach((k) => { if (suite[k] === ref) delete suite[k]; });
      if (ref) suite[titanId] = ref; else delete suite[titanId];
      onPublierSieges(suite);
    };

    return (
      <div style={{
        border: `2px solid ${T.you}`, borderRadius: T.rPlate,
        padding: "12px 14px", marginBottom: 20, background: "rgba(255,217,61,.07)",
      }}>
        <div style={{ ...marquee(".9rem", T.you), marginBottom: 8 }}>Table ouverte</div>

        {/* Ce qu'il faut dicter au téléphone, en gros et séparé : c'est la seule
            information que ce panneau existe pour transmettre. */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={label(T.faint, T.micro)}>Identifiant</div>
            <div style={readout("1.5rem", T.you)}>{session.id}</div>
          </div>
          <div>
            <div style={label(T.faint, T.micro)}>Adresse du relais</div>
            <div style={{ ...prose(T.dim, T.small), wordBreak: "break-all", maxWidth: 340 }}>
              {session.base}
            </div>
          </div>
        </div>
        <p style={{ ...prose(T.faint, T.micro), margin: "0 0 10px" }}>
          Donne ces deux lignes et le mot de passe à tes joueurs. Le mot de passe
          n&apos;est affiché nulle part : c&apos;est toi qui l&apos;as choisi, à
          toi de le dire.
        </p>

        {invites.length === 0 ? (
          <p style={{ ...prose(T.dim, T.small), margin: "0 0 10px" }}>
            Personne n&apos;est encore arrivé.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {Array.from({ length: nbJoueurs }, (_, i) => i + 1).map((id) => {
              const tc = TITAN_COLORS[id];
              const occupant = distantSieges?.[id] || "";
              const estIa = titanModes?.[id] === "ia";
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  border: `1px solid ${tc?.accent || T.rule}66`,
                  borderRadius: T.rChip, padding: "6px 8px",
                }}>
                  <TitanIcon titanId={id} size={22} variant="plain" />
                  <span style={{ ...label(T.text, T.small), minWidth: 90 }}>
                    {titanNames?.[id] || `Titan ${id}`}
                  </span>
                  {estIa ? (
                    <span style={{ ...prose(T.tele, T.micro), marginLeft: "auto" }}>
                      🤖 tenu par l&apos;IA
                    </span>
                  ) : (
                    <select
                      value={occupant}
                      onChange={(e) => donnerSiege(id, e.target.value)}
                      aria-label={`Qui tient le Titan ${id}`}
                      style={{ ...champ, width: "auto", marginLeft: "auto", padding: "5px 8px" }}
                    >
                      <option value="">— toi, sur cet appareil —</option>
                      {invites.map((j) => (
                        <option key={j.ref} value={j.ref}>{j.pseudo}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {distantAvis && (
          <p style={{ ...prose(T.dim, T.micro), margin: "0 0 8px" }}>{distantAvis}</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onLancer} style={btnStyle(T.you)}>
            Lancer la partie
          </button>
          <button onClick={onQuitterSession} style={cancelBtn()}>Fermer la table</button>
        </div>
      </div>
    );
  }

  /* ── PAS ENCORE CONNECTÉ ── */
  if (ecran === "ferme") {
    return (
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setEcran("choix")} style={btnStyle(null)}>
          <Icon name="teleport" size={13} /> Jouer à distance
        </button>
      </div>
    );
  }

  return (
    <div style={{
      border: `2px solid ${T.rule}`, borderRadius: T.rPlate,
      padding: "12px 14px", marginBottom: 20,
    }}>
      <div style={{ ...marquee(".9rem", T.you), marginBottom: 8 }}>Jouer à distance</div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <div>
          <label htmlFor="relais-url" style={label(T.faint, T.micro)}>
            Adresse du relais
          </label>
          <input
            id="relais-url" type="text" value={urlRelais}
            onChange={(e) => setUrlRelais(e.target.value)}
            placeholder="https://xxxx.trycloudflare.com"
            style={champ}
          />
        </div>
        <div>
          <label htmlFor="relais-pseudo" style={label(T.faint, T.micro)}>Ton nom</label>
          <input
            id="relais-pseudo" type="text" value={pseudo} maxLength={18}
            onChange={(e) => setPseudo(e.target.value)}
            style={champ}
          />
        </div>
      </div>

      {ecran === "choix" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setEcran("creer")} style={btnStyle(T.you)}>
            Ouvrir une table
          </button>
          <button onClick={() => setEcran("rejoindre")} style={btnStyle(null)}>
            Rejoindre une table
          </button>
          <button onClick={() => setEcran("ferme")} style={cancelBtn()}>Annuler</button>
        </div>
      )}

      {(ecran === "creer" || ecran === "rejoindre") && (
        <div style={{ display: "grid", gap: 8 }}>
          {ecran === "rejoindre" && (
            <div>
              <label htmlFor="relais-id" style={label(T.faint, T.micro)}>
                Identifiant de la table
              </label>
              <input
                id="relais-id" type="text" value={idSalle} maxLength={6}
                onChange={(e) => setIdSalle(e.target.value.toUpperCase())}
                placeholder="AB3K7P"
                style={{ ...champ, letterSpacing: ".2em" }}
              />
            </div>
          )}
          <div>
            <label htmlFor="relais-mdp" style={label(T.faint, T.micro)}>
              Mot de passe {ecran === "creer" && "(4 caractères minimum)"}
            </label>
            {/* `type="password"` et non `text` : l'appareil de l'hôte est
                souvent tourné vers la table pendant qu'il installe la partie. */}
            <input
              id="relais-mdp" type="password" value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="off"
              style={champ}
            />
          </div>
          {erreur && (
            <p style={{ ...prose("#ef4444", T.small), margin: 0 }}>{erreur}</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => agir(ecran)}
              disabled={occupe || !urlRelais || motDePasse.length < 4
                || (ecran === "rejoindre" && idSalle.length !== 6)}
              style={btnStyle(T.you)}
            >
              {occupe ? "Connexion…" : ecran === "creer" ? "Ouvrir" : "Rejoindre"}
            </button>
            <button onClick={() => { setEcran("choix"); setErreur(null); }} style={cancelBtn()}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
