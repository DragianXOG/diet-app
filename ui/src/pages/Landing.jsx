import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}

export default function Landing() {
  const nav = useNavigate();

  return (
    <main className="container mx-auto max-w-3xl p-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold mb-3">Life — Health</h1>
        <p className="text-muted-foreground mb-6">Welcome. Choose Login or Register to get started.</p>
        <div className="flex items-center justify-center gap-3">
          <Button size="lg" className="px-5 py-3" onClick={() => nav("/login")}>
            Login
          </Button>
          <Button size="lg" className="px-5 py-3" onClick={() => nav("/signup")}>
            Register
          </Button>
        </div>
      </section>
    </main>
  );
}
