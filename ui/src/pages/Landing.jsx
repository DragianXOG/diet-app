import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}

const tok = "";
export default function Landing() {
  const nav = useNavigate();

  // If already authed, send user to intake (if missing) or app (if present)
  useEffect(() => {
    if (!tok) return; // not signed in -> stay on landing
    (async () => {
      try {
        const base = getBase();
        const r = await fetch(`${base}/api/v1/intake_open_open_open`);
        let j = null; try { j = await r.json(); } catch {}
        if (r.ok && j) {
          window.location.replace("/app");
        } else {
          window.location.replace("/intake");
        }
      } catch {
        window.location.replace("/intake");
      }
    })();
  }, []);

  return (
    <main className="container mx-auto max-w-3xl p-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold mb-3">Life — Health</h1>
        <p className="text-muted-foreground mb-6">Sign up to personalize your plan. We’ll collect your intake first.</p>
        <div className="flex items-center justify-center gap-3">
          <Button size="lg" className="px-5 py-3" onClick={() => nav("/login")}>
            Login — Existing User
          </Button>
          <Button size="lg" className="px-5 py-3" onClick={() => nav("/signup")}>
            Signup — New User
          </Button>
        </div>
      </section>
    </main>
  );
}