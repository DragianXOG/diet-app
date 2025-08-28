import React, { useEffect } from "react";

export default function SimpleAuthFlow() {
  useEffect(() => {
    console.log("AUTH overlay mounted");
    window.__authOverlay = "mounted";
  }, []);

  const wrap = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(255,255,255,0.98)",
    display: "grid",
    placeItems: "center",
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
  };
  const box = {
    maxWidth: 640,
    width: "100%",
    textAlign: "center",
    padding: "32px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 10px 30px rgba(0,0,0,.10)",
    background: "#fff"
  };
  const h1 = { fontSize: "40px", fontWeight: 700, margin: 0, color: "#111827" };
  const p = { marginTop: 8, marginBottom: 24, color: "#4b5563" };
  const row = { display:"flex", gap:"12px", justifyContent:"center" };
  const primary = { padding:"10px 18px", borderRadius:12, border:"1px solid #4B0082", background:"#4B0082", color:"#fff", cursor:"pointer" };
  const secondary = { padding:"10px 18px", borderRadius:12, border:"1px solid #4B0082", background:"transparent", color:"#4B0082", cursor:"pointer" };

  return (
    <div style={wrap}>
      <div style={box}>
        <h1 style={h1}>Life – Health</h1>
        <p style={p}>DEBUG: This screen is forced on to verify overlay visibility.</p>
        <div style={row}>
          <button style={primary} onClick={()=>alert("Login clicked")}>Login — Existing User</button>
          <button style={secondary} onClick={()=>alert("Signup clicked")}>Signup — New User</button>
        </div>
      </div>
    </div>
  );
}
