import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}
function getToken() {
  return localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token") || "";
}
async function apiRequest(path, { method = "GET", body, headers } = {}) {
  const base = getBase();
  const url = path.startsWith("http") ? path : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
  const tok = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(tok ? { "Authorization": `Bearer ${tok}` } : {}),
      ...(headers || {})
    },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
  });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch {}
  if (!res.ok) throw new Error(json?.detail || txt || `HTTP ${res.status}`);
  return json ?? txt;
}

// Heuristic parser helpers (simple; server stays source of truth)
function parseMealsPerDay(notes) {
  if (!notes) return null;
  const m = String(notes).match(/(\d+)\s*meals?/i);
  return m ? parseInt(m[1], 10) : null;
}
function parseLossPerWeek(goals) {
  if (!goals) return null;
  const g = goals.toLowerCase();
  const m = g.match(/lose\s+(\d+)\s*(lb|pounds?)/i);
  if (!m) return null;
  const pounds = parseInt(m[1], 10);
  let weeks = null;
  const w = g.match(/in\s+(\d+)\s*(weeks?|wks?)/i);
  if (w) weeks = parseInt(w[1], 10);
  const perw = g.match(/(\d+(?:\.\d+)?)\s*(lb|pounds?)\s*per\s*week/);
  if (perw) return parseFloat(perw[1]);
  if (weeks && weeks > 0) return pounds / weeks;
  return null;
}

export default function Intake() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    name: "", age: "", sex: "", height_in: "", weight_lb: "",
    diabetic: false, conditions: "", meds: "", goals: "", zip: "", gym: "",
    food_notes: "", workout_notes: ""
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const tok = getToken();
        if (!tok) { nav("/login"); return; }
        const data = await apiRequest("/api/v1/intake");
        if (data) {
          setForm({
            name: data.name ?? "",
            age: data.age ?? "",
            sex: data.sex ?? "",
            height_in: data.height_in ?? "",
            weight_lb: data.weight_lb ?? "",
            diabetic: !!data.diabetic,
            conditions: data.conditions ?? "",
            meds: data.meds ?? "",
            goals: data.goals ?? "",
            zip: data.zip ?? "",
            gym: data.gym ?? "",
            food_notes: data.food_notes ?? "",
            workout_notes: data.workout_notes ?? "",
          });
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  function setField(k, v){ setForm(prev => ({ ...prev, [k]: v })); }

  async function onSubmit() {
    setErr("");
    try {
      const meals = parseMealsPerDay(form.food_notes);
      const rate = parseLossPerWeek(form.goals); // lb/week
      if (rate && meals && meals >= 3 && rate > 2.0) {
        const ok = confirm(
          "Your goals look aggressive for a 3‑meals/day pattern.\n\n" +
          "Please be safe and speak with a medical professional before considering this diet. " +
          "Given the amount of weight and timeframe, an intermittent fasting pattern (~2 meals/day) " +
          "may fit better.\n\nContinue and save these intake settings?"
        );
        if (!ok) return;
      }
      setSaving(true);
      const payload = { ...form };
      // Normalize optional numerics
      payload.age = payload.age ? Number(payload.age) : undefined;
      payload.height_in = payload.height_in ? Number(payload.height_in) : undefined;
      payload.weight_lb = payload.weight_lb ? Number(payload.weight_lb) : undefined;

      await apiRequest("/api/v1/intake", { method: "POST", body: payload });
      nav("/app");
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setSaving(false); }
  }

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>About You — Intake</CardTitle>
          <CardDescription>Tell us about your goals and preferences. This guides your meal and workout plans.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loading && <div>Loading…</div>}
          {!!err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={e=>setField("name", e.target.value)} placeholder="Your name"/>
            </div>
            <div className="grid gap-1">
              <Label>Age</Label>
              <Input type="number" value={form.age} onChange={e=>setField("age", e.target.value)} placeholder="e.g., 34"/>
            </div>
            <div className="grid gap-1">
              <Label>Sex</Label>
              <Select value={form.sex || ""} onValueChange={v=>setField("sex", v)}>
                <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                  <SelectItem value="O">Other / Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Height (inches)</Label>
              <Input type="number" value={form.height_in} onChange={e=>setField("height_in", e.target.value)} placeholder="e.g., 70"/>
            </div>
            <div className="grid gap-1">
              <Label>Weight (lb)</Label>
              <Input type="number" value={form.weight_lb} onChange={e=>setField("weight_lb", e.target.value)} placeholder="e.g., 190"/>
            </div>
            <div className="grid gap-1">
              <Label>ZIP / Location</Label>
              <Input value={form.zip || ""} onChange={e=>setField("zip", e.target.value)} placeholder="optional"/>
            </div>
            <div className="grid gap-1">
              <Label>Gym</Label>
              <Input value={form.gym || ""} onChange={e=>setField("gym", e.target.value)} placeholder="e.g., Crunch, Planet Fitness, Home"/>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <Switch checked={!!form.diabetic} onCheckedChange={v=>setField("diabetic", !!v)} />
              <Label>Diabetic</Label>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Health Conditions & Meds</Label>
            <Textarea rows={3} value={form.conditions} onChange={e=>setField("conditions", e.target.value)} placeholder="e.g., hypertension, shoulder pain, meds list…"/>
          </div>
          <div className="grid gap-1">
            <Label>Goals</Label>
            <Textarea rows={3} value={form.goals} onChange={e=>setField("goals", e.target.value)} placeholder="e.g., Lose 15 lb in 8 weeks; feel more energetic; improve A1C"/>
            <p className="text-sm text-muted-foreground mt-1">Tip: Include timelines (e.g., “in 8 weeks”) so we can tailor pace and warnings.</p>
          </div>

          <div className="grid gap-1">
            <Label>Notes about food choices (free‑form)</Label>
            <Textarea rows={5} value={form.food_notes} onChange={e=>setField("food_notes", e.target.value)}
              placeholder={"Examples:\n• Prefer 15–20 min meals; dislike cilantro; limit dairy\n• Usually 3 meals/day; ok with salmon & chicken; avoid pork\n• Like Mediterranean flavors; pantry staples only Mon–Thu"} />
            <p className="text-sm text-muted-foreground mt-1">
              Describe preferences, dislikes, time available, and meals/day. The app will interpret this to guide your plan.
            </p>
          </div>

          <div className="grid gap-1">
            <Label>Workout preferences & constraints (free‑form)</Label>
            <Textarea rows={5} value={form.workout_notes} onChange={e=>setField("workout_notes", e.target.value)}
              placeholder={"Examples:\n• Home only; adjustable dumbbells to 50 lb, bands\n• Prefer yoga & calisthenics; injured shoulder—avoid overhead pressing\n• Gym: Planet Fitness (Smith machine ok); 4x/week 30–45 min"} />
            <p className="text-sm text-muted-foreground mt-1">
              Include gym/home, equipment, preferred styles, and any injuries or limits.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={onSubmit} disabled={saving}>Submit</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}