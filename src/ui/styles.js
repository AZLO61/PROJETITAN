export function btnStyle(c1, c2, active = true) {
  return { background: c1 && c2 ? `linear-gradient(135deg,${c1},${c2})` : "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: active && c1 ? "#0E0420" : "#fff", fontWeight: 700, padding: "8px 12px", fontFamily: "'Bowlby One', sans-serif", fontSize: ".76rem", cursor: "pointer" };
}
export function smallBtn(enabled, c1, c2) {
  return { background: enabled ? `linear-gradient(135deg,${c1},${c2})` : "rgba(255,255,255,.07)", border: "none", borderRadius: 6, color: enabled ? "#0E0420" : "rgba(255,255,255,.4)", fontWeight: 700, padding: "4px 10px", fontSize: ".72rem", cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5 };
}
export function cancelBtn() {
  return { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, color: "#fff", padding: "4px 10px", fontSize: ".72rem", cursor: "pointer" };
}
