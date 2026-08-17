import React from "react";

// ErrorBoundary racine : sans lui, la moindre exception pendant le rendu
// (titan introuvable, case de plateau nulle, carte sans id...) démonte tout
// l'arbre React et laisse une page blanche silencieuse — seule la console
// garde une trace. Ici, on affiche l'erreur ET sa pile directement à l'écran,
// avec un bouton pour relancer l'app sans recharger la page à la main.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Toujours visible en console pour le debug / les logs CI.
    console.error("[ErrorBoundary] Crash intercepté :", error, info);
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0E0420",
          color: "#fff",
          fontFamily: "'Bowlby One', sans-serif, monospace",
          padding: "24px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h1 style={{ fontSize: "1.1rem", margin: 0, color: "#ff6b6b" }}>
          ⚠ Le jeu a rencontré une erreur
        </h1>
        <p style={{ fontFamily: "sans-serif", fontSize: ".85rem", opacity: 0.8, margin: 0 }}>
          Copie le message ci-dessous (bouton "Copier") pour qu'on puisse le corriger précisément.
        </p>
        <pre
          style={{
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,80,80,.4)",
            borderRadius: 8,
            padding: 14,
            fontSize: ".78rem",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "auto",
            maxHeight: "50vh",
          }}
        >
          {String(error && error.stack ? error.stack : error)}
          {info && info.componentStack ? `\n\n--- Component stack ---${info.componentStack}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={this.handleReset}
            style={{
              background: "linear-gradient(135deg,#71dbff,#b88cff)",
              border: "none",
              borderRadius: 6,
              color: "#0E0420",
              fontWeight: 700,
              padding: "8px 14px",
              fontFamily: "'Bowlby One', sans-serif",
              fontSize: ".76rem",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          <button
            onClick={() => {
              const text = `${error && error.stack ? error.stack : error}\n\n--- Component stack ---${
                info && info.componentStack ? info.componentStack : ""
              }`;
              if (navigator.clipboard) navigator.clipboard.writeText(text);
            }}
            style={{
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 6,
              color: "#fff",
              padding: "8px 14px",
              fontFamily: "'Bowlby One', sans-serif",
              fontSize: ".76rem",
              cursor: "pointer",
            }}
          >
            Copier l'erreur
          </button>
        </div>
      </div>
    );
  }
}
