import SimpleAuthFlow from "./components/auth/SimpleAuthFlow.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Dumbbell, Utensils, ListChecks, Activity, Settings, FileJson, PlayCircle, RefreshCcw, Save, Download, Database, BarChart3, Drumstick, Milk, Egg } from "lucide-react";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Utility: Local storage helpers
const ls = {
  get(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch { return v; }
  } catch {
    return fallback;
  }
},

  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

// API Client
function useApi() {
  const [baseUrl, setBaseUrl] = useState(() => {
    const urlParam = new URLSearchParams(window.location.search).get("api");
    return ls.get("diet.baseUrl", urlParam || localStorage.getItem("diet.app.base") || `${window.location.protocol}//${window.location.hostname}:8010`);
  });
  const [token, setToken] = useState(() => ls.get("diet.token", (localStorage.getItem("diet.app.token") || "")));
  const [userId, setUserId] = useState(() => ls.get("diet.userId", ""));

  useEffect(() => { ls.set("diet.baseUrl", baseUrl); }, [baseUrl]);
  useEffect(() => { ls.set("diet.token", token); }, [token, baseUrl]);
  useEffect(() => { ls.set("diet.userId", userId); }, [userId]);

  
  
  // Listen for auth/base changes from overlay
  useEffect(() => {
    function onTok(e){ setToken(e.detail || localStorage.getItem("diet.app.token") || ""); }
    function onBase(e){ setBaseUrl(e.detail || (localStorage.getItem("diet.app.base") || `${window.location.protocol}//${window.location.hostname}:8010`)); }
    window.addEventListener("diet.token", onTok);
    window.addEventListener("diet.base", onBase);
    return () => { window.removeEventListener("diet.token", onTok); window.removeEventListener("diet.base", onBase); };
  }, []);
useEffect(() => {
    (async () => {
      try {
        if (!token || userId) return;
        const me = await request("/api/v1/auth/me");
        if (me?.id) setUserId(String(me.id));
      } catch (e) {}
    })();
  }, [token, baseUrl]);
async function request(path, { method = "GET", body, headers } = {}) {
    const url = path.startsWith("http") ? path : `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
    const opts = {
      method,
      headers: {
        "Accept": "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
    };
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = json?.detail || json?.message || text || `HTTP ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return json ?? text;
  }

  return { baseUrl, setBaseUrl, token, setToken, userId, setUserId, request };
}

// Pretty JSON viewer
function JsonView({ data }) {
  if (data == null) return <div className="text-muted-foreground text-sm">No data</div>;
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="bg-muted rounded-xl p-4 text-sm overflow-auto max-h-[50vh]"><code>{str}</code></pre>
  );
}

// Tiny CSV exporter
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Settings Panel
function SettingsPanel({ api }) {
  const [ping, setPing] = useState(null);
  const [checking, setChecking] = useState(false);

  async function healthCheck() {
    setChecking(true);
    try {
      // Try common health endpoints in order
      const candidates = ["/health", "/status", "/", "/docs", "/openapi.json"];
      for (const p of candidates) {
        try {
          const data = await api.request(p);
          setPing({ path: p, data });
          setChecking(false);
          return;
        } catch {}
      }
      throw new Error("No health endpoint responded.");
    } catch (e) {
      setPing({ error: String(e) });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><Settings className="w-5 h-5"/> API Settings</CardTitle>
        <CardDescription>Point this UI to your running Diet‑App API and (optionally) paste a Bearer token. Values are saved locally.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Base URL</Label>
            <Input value={api.baseUrl} onChange={(e)=>api.setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8010"/>
          </div>
          <div className="grid gap-2">
            <Label>User ID</Label>
            <Input value={api.userId} onChange={(e)=>api.setUserId(e.target.value)} placeholder="e.g., 1"/>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Bearer token (optional)</Label>
          <Input value={api.token} onChange={(e)=>api.setToken(e.target.value)} placeholder="eyJhbGciOi..."/>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={healthCheck} disabled={checking}>
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-white"/> : <Activity className="w-4 h-4 mr-2"/>}
            Check API
          </Button>
          {ping?.path && <Badge variant="secondary">Responded: {ping.path}</Badge>}
        </div>
        {ping && <JsonView data={ping.error ? { error: ping.error } : ping.data} />}
      </CardContent>
    </Card>
  );
}

// API Explorer
function ApiExplorer({ api }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/openapi.json");
  const [body, setBody] = useState("{")
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  async function send() {
    setLoading(true); setResp(null);
    try {
      const payload = ["POST","PUT","PATCH","DELETE"].includes(method) && body.trim() ? JSON.parse(body) : undefined;
      const data = await api.request(path, { method, body: payload });
      setResp({ ok: true, data });
    } catch (e) {
      setResp({ ok: false, error: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><Database className="w-5 h-5"/> API Explorer</CardTitle>
        <CardDescription>Call any endpoint on your API. Useful while your backend evolves.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="grid gap-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                {['GET','POST','PUT','PATCH','DELETE'].map(m=> <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 grid gap-1">
            <Label>Path</Label>
            <Input value={path} onChange={(e)=>setPath(e.target.value)} placeholder="/health" />
          </div>
        </div>
        {['POST','PUT','PATCH','DELETE'].includes(method) && (
          <div className="grid gap-1">
            <Label>JSON Body</Label>
            <Textarea rows={6} value={body} onChange={(e)=>setBody(e.target.value)} placeholder='{"name":"eggs","quantity":12,"unit":"ct"}'/>
          </div>
        )}
        <div className="flex gap-4">
          <Button onClick={send} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-white"/> : <PlayCircle className="w-4 h-4 mr-2"/>}
            Send
          </Button>
          {resp && <Badge variant={resp.ok?"default":"destructive"}>{resp.ok?"Success":"Error"}</Badge>}
        </div>
        {resp && <JsonView data={resp.ok ? resp.data : { error: resp.error }} />}
      </CardContent>
    </Card>
  );
}

// Grocery List module (works locally, can sync with API if endpoints match)
function GroceryList({ api }) {
  const [items, setItems] = useState(() => ls.get("diet.groceries", []));
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(()=> ls.set("diet.groceries", items), [items]);

  function addLocal(item) { setItems(prev => [{ id: Date.now(), purchased: false, ...item }, ...prev]); }

  async function loadFromApi() {
    setLoading(true); setStatus("");
    try {
      const data = await api.request("/api/v1/groceries");
      setItems(data);
      setStatus("Loaded from /api/v1/groceries");
    } catch (e) {
      setStatus("Could not load /api/v1/groceries; using local list only.");
    } finally { setLoading(false); }
  }

  async function add() {
    const item = { name: name.trim(), quantity: Number(quantity)||1, unit: unit || undefined };
    if (!item.name) return;
    setName(""); setQuantity("1"); setUnit("");
    addLocal(item);
    try { await api.request("/api/v1/groceries", { method: "POST", body: item }); setStatus("Synced to /api/v1/groceries"); }
    catch { /* local only */ setStatus("Saved locally (API unavailable)"); }
  }

  async function togglePurchased(id, current) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, purchased: !current } : it));
    try { await api.request(`/api/v1/groceries/${id}`, { method: "PATCH", body: { purchased: !current } }); }
    catch {}
  }

  async function remove(id) {
    setItems(prev => prev.filter(it => it.id !== id));
    try { await api.request(`/api/v1/groceries/${id}`, { method: "DELETE" }); }
    catch {}
  }

  function exportCsv() {
    const headers = ["id","name","quantity","unit","purchased","created_at"]; 
    const rows = items.map(x=> headers.map(h=> JSON.stringify(x[h]??""))).join("\n");
    downloadTextFile(`grocery-list-${new Date().toISOString().slice(0,10)}.csv`, headers.join(",")+"\n"+rows);
  }

  
// Build groceries from the current meal plan window (default 7 days)
async function buildFromMeals(days = 7, replace = true) {
  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  try {
    const now = Date.now();
    const start = iso(now);
    const end = iso(now + (days - 1) * 24 * 60 * 60 * 1000);
    setStatus(`Building from meal plan ${start}..${end}...`);
    await api.request(`/api/v1/groceries/sync_from_meals?start=${start}&end=${end}&persist=true&clear_existing=${replace}`, { method: "POST" });
    const data = await api.request("/api/v1/groceries");
    setItems(data);
    setStatus(`Built from meal plan (${data.length} items)`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to build from meal plan.");
  }
}
return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><ListChecks className="w-5 h-5"/> Grocery List</CardTitle>
        <CardDescription>Add items, check them off, and optionally sync with your API at <code>/api/v1/groceries</code>.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="grid gap-1"><Label>Item</Label><Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="eggs, milk, chicken"/></div>
          <div className="grid gap-1"><Label>Qty</Label><Input type="number" value={quantity} onChange={(e)=>setQuantity(e.target.value)} /></div>
          <div className="grid gap-1"><Label>Unit</Label><Input value={unit} onChange={(e)=>setUnit(e.target.value)} placeholder="ct, gallon, lb"/></div>
          <div className="flex items-end gap-4">
            <Button onClick={add}><Save className="w-4 h-4 mr-2 text-white"/>Add</Button>
            <Button variant="secondary" onClick={exportCsv}><Download className="w-4 h-4 mr-2"/>Export</Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={loadFromApi} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-white"/> : <RefreshCcw className="w-4 h-4 mr-2 text-white"/>}
            Sync from API
          </Button>
            <Button variant="default" onClick={() => buildFromMeals(7, true)} className="ml-2">Build from Meal Plan (7 days)</Button>
            
          {status && <Badge variant="secondary">{status}</Badge>}
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">✔</th>
                <th className="text-left p-3">Item</th>
                <th className="text-left p-3">Qty</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t">
                  <td className="p-3"><Checkbox checked={!!it.purchased} onCheckedChange={()=>togglePurchased(it.id, !!it.purchased)} /></td>
                  <td className="p-3 font-medium flex items-center gap-4">{it.name}
                    {/^egg/i.test(it.name) && <Egg className="w-4 h-4"/>}
                    {/^milk/i.test(it.name) && <Milk className="w-4 h-4"/>}
                    {/(beef|steak|ground)/i.test(it.name) && <Drumstick className="w-4 h-4"/>}
                  </td>
                  <td className="p-3">{it.quantity ?? 1}</td>
                  <td className="p-3">{it.unit ?? ""}</td>
                  <td className="p-3"><Button size="sm" variant="ghost" onClick={()=>remove(it.id)}>Remove</Button></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No items yet – add your first above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Meal Plan (integrates with /plans/{userId}/menu/build?format=json when available)
// --- About You (Intake editor) ---
function AboutYou({ api }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    name: "", age: "", sex: "", height_in: "", weight_lb: "",
    diabetic: false, conditions: "", meds: "", goals: "", zip: "", gym: "",
    food_notes: "", workout_notes: ""
  });

  useEffect(() => {
    (async () => {
      if (!api.token) return;
      setLoading(true);
      try {
        const data = await api.request("/api/v1/intake");
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
          setStatus("Loaded your intake");
        } else {
          setStatus("No intake yet — fill it out and submit.");
        }
      } catch (e) {
        setStatus("Could not load intake yet.");
      } finally { setLoading(false); }
    })();
  }, [api.token, api.baseUrl]);

  function setField(k, v){ setForm(prev => ({ ...prev, [k]: v })); }

  // Simple heuristics for safety check (UI-only)
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

  async function submit() {
    setErr(""); setStatus("");
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
      // normalize numeric optionals
      payload.age = payload.age ? Number(payload.age) : undefined;
      payload.height_in = payload.height_in ? Number(payload.height_in) : undefined;
      payload.weight_lb = payload.weight_lb ? Number(payload.weight_lb) : undefined;

      await api.request("/api/v1/intake", { method: "POST", body: payload });
      setStatus("Saved.");
    } catch(e) {
      setErr(String(e.message || e));
    } finally { setSaving(false); }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3"><FileJson className="w-5 h-5"/> About You</CardTitle>
        <CardDescription>This information personalizes your plan. You can update it anytime.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading && <div>Loading…</div>}
        {!!err && <div className="text-red-600 text-sm">{err}</div>}
        {!!status && <div className="text-sm text-muted-foreground">{status}</div>}

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
          <Textarea rows={3} value={form.goals} onChange={e=>setField("goals", e.target.value)} placeholder="e.g., Lose 15 lb in 8 weeks; improve A1C; feel more energetic"/>
          <p className="text-sm text-muted-foreground mt-1">Tip: Include timelines (e.g., “in 8 weeks”) so we can tailor pace and warnings.</p>
        </div>

        <div className="grid gap-1">
          <Label>Notes about food choices (free‑form)</Label>
          <Textarea rows={5} value={form.food_notes} onChange={e=>setField("food_notes", e.target.value)}
            placeholder={"Examples:\n• Prefer 15–20 min meals; dislike cilantro; limit dairy\n• Usually 3 meals/day; ok with salmon & chicken; avoid pork\n• Like Mediterranean flavors; pantry staples only Mon–Thu"} />
          <p className="text-sm text-muted-foreground mt-1">
            Describe preferences, dislikes, time available, and meals/day. We interpret this to guide your plan.
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
          <Button onClick={submit} disabled={saving}>Submit</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Keep MealPlan below
function MealPlan({ api }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function buildPlan() {
    setLoading(true); setStatus(""); setPlan(null);
    try {
      // Try to ensure we have a user id for downstream features (non-blocking)
      let uid = api.userId;
      if (!uid && api.token) {
        try {
          const me = await api.request("/api/v1/auth/me");
          if (me?.id) { uid = String(me.id); api.setUserId(uid); }
        } catch {}
      }

      // Load meals from the real API
      const meals = await api.request("/api/v1/meals");
      if (!Array.isArray(meals) || meals.length === 0) {
        setStatus("No meals on server yet — showing demo.");
        setPlan({ week: 1, days: [
          { day: "Mon", meals: [{ time: "12:00", title: "Egg scramble", carbs: 6, kcal: 420 }, { time: "18:00", title: "Grilled chicken + salad", carbs: 10, kcal: 520 }]},
          { day: "Tue", meals: [{ time: "12:00", title: "Greek yogurt + walnuts", carbs: 9, kcal: 380 }, { time: "18:00", title: "Beef stir-fry (cauli rice)", carbs: 11, kcal: 560 }]},
          { day: "Wed", meals: [{ time: "12:00", title: "Tuna avocado boats", carbs: 5, kcal: 430 }, { time: "18:00", title: "Turkey lettuce tacos", carbs: 12, kcal: 540 }]},
          { day: "Thu", meals: [{ time: "12:00", title: "Protein shake", carbs: 7, kcal: 350 }, { time: "18:00", title: "Pork chops + green beans", carbs: 9, kcal: 570 }]},
          { day: "Fri", meals: [{ time: "12:00", title: "Cottage cheese bowl", carbs: 8, kcal: 360 }, { time: "18:00", title: "Salmon + asparagus", carbs: 6, kcal: 550 }]},
          { day: "Sat", meals: [{ time: "12:00", title: "Chicken Caesar salad", carbs: 10, kcal: 480 }, { time: "18:00", title: "Burger (no bun) + slaw", carbs: 14, kcal: 590 }]},
          { day: "Sun", meals: [{ time: "12:00", title: "Omelet + spinach", carbs: 7, kcal: 410 }, { time: "18:00", title: "Roast chicken + veg", carbs: 12, kcal: 560 }]} 
        ]});
      } else {
        // Group meals by eaten_at date (YYYY-MM-DD)
        const byDay = {};
        for (const m of meals) {
          const day = (m.eaten_at || "").slice(0,10) || "Day";
          (byDay[day] ||= []).push(m);
        }
        const days = Object.keys(byDay).sort().map(day => ({
          day,
          meals: byDay[day].map(m => ({
            time: (m.eaten_at || "").slice(11,16) || "",
            title: m.name || "Meal",
            carbs: m.total_carbs ?? null,
            kcal: m.total_calories ?? null,
          })),
        }));
        setPlan({ week: 1, days });
        setStatus("Loaded meals from API");
      }
    } catch (e) {
      setStatus("Could not load meals — showing demo.");
      setPlan({ week: 1, days: [
        { day: "Mon", meals: [{ time: "12:00", title: "Egg scramble", carbs: 6, kcal: 420 }, { time: "18:00", title: "Grilled chicken + salad", carbs: 10, kcal: 520 }]},
        { day: "Tue", meals: [{ time: "12:00", title: "Greek yogurt + walnuts", carbs: 9, kcal: 380 }, { time: "18:00", title: "Beef stir-fry (cauli rice)", carbs: 11, kcal: 560 }]},
        { day: "Wed", meals: [{ time: "12:00", title: "Tuna avocado boats", carbs: 5, kcal: 430 }, { time: "18:00", title: "Turkey lettuce tacos", carbs: 12, kcal: 540 }]},
        { day: "Thu", meals: [{ time: "12:00", title: "Protein shake", carbs: 7, kcal: 350 }, { time: "18:00", title: "Pork chops + green beans", carbs: 9, kcal: 570 }]},
        { day: "Fri", meals: [{ time: "12:00", title: "Cottage cheese bowl", carbs: 8, kcal: 360 }, { time: "18:00", title: "Salmon + asparagus", carbs: 6, kcal: 550 }]},
        { day: "Sat", meals: [{ time: "12:00", title: "Chicken Caesar salad", carbs: 10, kcal: 480 }, { time: "18:00", title: "Burger (no bun) + slaw", carbs: 14, kcal: 590 }]},
        { day: "Sun", meals: [{ time: "12:00", title: "Omelet + spinach", carbs: 7, kcal: 410 }, { time: "18:00", title: "Roast chicken + veg", carbs: 12, kcal: 560 }]} 
      ]});
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!plan?.days) return;
    const rows = [["day","time","title","carbs","kcal"]].concat(
      plan.days.flatMap(d => d.meals.map(m => [d.day, m.time, m.title, m.carbs ?? "", m.kcal ?? ""]))
    );
    const text = rows.map(r => r.map(x => JSON.stringify(x ?? "")).join(",")).join("\n");
    downloadTextFile(`meal-plan-week-${plan.week||"x"}.csv`, text);
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><Utensils className="w-5 h-5"/> Meal Plan</CardTitle>
        <CardDescription>Generate your 2-meals/day plan from the backend, or preview a demo layout.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-4">
          <Button onClick={buildPlan} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-white"/> : <RefreshCcw className="w-4 h-4 mr-2 text-white"/>}
            Build / Refresh
          </Button>
          {plan && <Button variant="secondary" onClick={exportCsv}><Download className="w-4 h-4 mr-2"/>Export CSV</Button>}
          {status && <Badge variant="secondary">{status}</Badge>}
        </div>
        {plan ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plan.days?.map((d, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i*0.03 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{d.day}</CardTitle>
                    <CardDescription>2 meals</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 workouts-list">
                    {d.meals?.map((m, k) => (
                      <div key={k} className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">{m.time}</div>
                        <div className="font-medium">{m.title}</div>
                        <div className="text-xs text-muted-foreground">{m.carbs != null && <>Carbs: <b>{m.carbs} g</b></>} {m.kcal != null && <> · {m.kcal} kcal</>}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">Click <em>Build / Refresh</em> to fetch from your API or see a demo.</div>
        )}
      </CardContent>
    </Card>
  );
}
// Trackers (weight + glucose)
function Trackers() {
  const [entries, setEntries] = useState(() => ls.get("diet.track", []));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [weight, setWeight] = useState("");
  const [glucose, setGlucose] = useState("");

  useEffect(()=> ls.set("diet.track", entries), [entries]);

  function add() {
    if (!weight && !glucose) return;
    setEntries(prev => [...prev, { date, weight: weight?Number(weight):null, glucose: glucose?Number(glucose):null }]);
    setWeight(""); setGlucose("");
  }

  const weightData = entries.filter(e=> e.weight != null);
  const glucoseData = entries.filter(e=> e.glucose != null);

  function exportCsv() {
    const headers = ["date","weight","glucose"]; 
    const rows = entries.map(x=> headers.map(h=> JSON.stringify(x[h]??""))).join("\n");
    downloadTextFile(`trackers-${new Date().toISOString().slice(0,10)}.csv`, headers.join(",")+"\n"+rows);
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><BarChart3 className="w-5 h-5"/> Trackers</CardTitle>
        <CardDescription>Log daily weight and glucose; view basic charts and export CSV.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="grid gap-1"><Label>Date</Label><Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} /></div>
          <div className="grid gap-1"><Label>Weight (lb)</Label><Input type="number" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder="295"/></div>
          <div className="grid gap-1"><Label>Glucose (mg/dL)</Label><Input type="number" value={glucose} onChange={(e)=>setGlucose(e.target.value)} placeholder="120"/></div>
          <div className="flex items-end gap-4">
            <Button onClick={add}><Save className="w-4 h-4 mr-2 text-white"/>Add</Button>
            <Button variant="secondary" onClick={exportCsv}><Download className="w-4 h-4 mr-2"/>Export</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 border rounded-xl p-2">
            <div className="text-sm text-muted-foreground mb-2">Weight</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" hide/>
                <YAxis domain={["auto","auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64 border rounded-xl p-2">
            <div className="text-sm text-muted-foreground mb-2">Glucose</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={glucoseData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" hide/>
                <YAxis domain={["auto","auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="glucose" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Weight</th>
                <th className="text-left p-3">Glucose</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{e.date}</td>
                  <td className="p-3">{e.weight ?? "—"}</td>
                  <td className="p-3">{e.glucose ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Intake (stored locally; optional POST to a custom endpoint)
function Intake({ api }) {
  const [form, setForm] = useState(() => ls.get("diet.intake", {
    name: "",
    age: 48,
    sex: "male",
    height_in: 75,
    weight_lb: 295,
    diabetic: true,
    conditions: "HTN, HLD, neuropathy, MS",
    meds: "Lantus (sliding), others",
    goals: "Lose 70 lb in 6 months, improve A1C",
    zip: "63011",
    gym: "Crunch"
  }));
  const [saving, setSaving] = useState(false);
  const [resp, setResp] = useState(null);

  useEffect(()=> ls.set("diet.intake", form), [form]);

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function saveToApi() {
  setSaving(true); setResp(null);
  try {
    const base = (new URLSearchParams(location.search).get("api"))
      || localStorage.getItem("diet.app.base")
      || `${location.protocol}//${location.hostname}:8010`;
    const token = localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token") || "";
    const r = await fetch(`${base}/api/v1/intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(form),
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.detail || j.error || r.statusText);
    setResp({ path: "/api/v1/intake", r: j });
  } catch (e) {
    setResp({ error: String(e) });
  } finally {
    setSaving(false);
  }
  }

return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3"><Activity className="w-5 h-5"/> Intake</CardTitle>
        <CardDescription>Fill in your details, then save to the API (auth required).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e)=>update("name", e.target.value)} placeholder="Your name"/>
          </div>
          <div className="grid gap-1">
            <Label>Age</Label>
            <Input type="number" value={form.age} onChange={(e)=>update("age", Number(e.target.value||0))} />
          </div>
          <div className="grid gap-1">
            <Label>Sex</Label>
            <Input value={form.sex} onChange={(e)=>update("sex", e.target.value)} placeholder="male / female"/>
          </div>

          <div className="grid gap-1">
            <Label>Height (in)</Label>
            <Input type="number" value={form.height_in} onChange={(e)=>update("height_in", Number(e.target.value||0))} />
          </div>
          <div className="grid gap-1">
            <Label>Weight (lb)</Label>
            <Input type="number" value={form.weight_lb} onChange={(e)=>update("weight_lb", Number(e.target.value||0))} />
          </div>
          <div className="grid gap-1">
            <Label>Diabetic</Label>
            <div className="h-10 flex items-center">
              <Checkbox checked={!!form.diabetic} onCheckedChange={(v)=>update("diabetic", !!v)} />
              <span className="ml-2 text-sm text-muted-foreground">Yes</span>
            </div>
          </div>

          <div className="md:col-span-3 grid gap-1">
            <Label>Conditions</Label>
            <Input value={form.conditions} onChange={(e)=>update("conditions", e.target.value)} placeholder="HTN, HLD, …"/>
          </div>
          <div className="md:col-span-3 grid gap-1">
            <Label>Meds</Label>
            <Input value={form.meds} onChange={(e)=>update("meds", e.target.value)} placeholder="Lantus, …"/>
          </div>
          <div className="md:col-span-3 grid gap-1">
            <Label>Goals</Label>
            <Input value={form.goals} onChange={(e)=>update("goals", e.target.value)} placeholder="Lose 70 lb in 6 months, improve A1C"/>
          </div>

          <div className="grid gap-1">
            <Label>ZIP</Label>
            <Input value={form.zip} onChange={(e)=>update("zip", e.target.value)} placeholder="63011"/>
          </div>
          <div className="grid gap-1">
            <Label>Gym</Label>
            <Input value={form.gym} onChange={(e)=>update("gym", e.target.value)} placeholder="Crunch / PF / Anytime / …"/>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="default" onClick={saveToApi} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-white"/> : <Save className="w-4 h-4 mr-2 text-white"/>}
            Save to API
          </Button>
          {resp?.path && <Badge variant="secondary">Saved: {resp.path}</Badge>}
        </div>

        {resp && <JsonView data={resp.error ? { error: resp.error } : resp.r} />}
      </CardContent>
    </Card>
  );
}


function Workouts() {
  const [note, setNote] = useState("");
  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-4"><Dumbbell className="w-5 h-5"/> Workouts</CardTitle>
        <CardDescription>Starter workouts stub (component was missing). You can log a quick note below.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <Label>Workout note</Label>
          <Input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="e.g., Leg press 3×15 @ 250 lb"/>
        </div>
        <div className="text-sm text-muted-foreground">We’ll replace this with machine-level plans next.</div>
      </CardContent>
    </Card>
  );
}


// Root App UI
export default function App() {
  const api = useApi();
  const [active, setActive] = useState("settings");

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#48A860] text-white hover:bg-[#4B0082] border-b shadow-soft shadow-soft">
        <div className="w-full px-6 py-4 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white ml-2">Life – Health</h1>
            <motion.div initial={{ rotate: -8 }} animate={{ rotate: 0 }}>
              <Utensils className="w-6 h-6 text-primary"/>
            </motion.div>
            <div>
              <div className="font-bold leading-tight brand-title">Diet‑App Frontend</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
          </div>
        </div>
      </header>

      {!api.token && <SimpleAuthFlow />}
      <main className="w-full px-6 py-6 md:py-8 lg:py-10 grid gap-5 md:gap-8 lg:gap-10">
        <Tabs value={active} onValueChange={setActive} className="w-full">
          <TabsList className="flex flex-wrap gap-2">
            <TabsTrigger value="intake" className="gap-2"><Activity className="w-4 h-4"/> Intake</TabsTrigger>
            <TabsTrigger value="meal" className="gap-2"><Utensils className="w-4 h-4"/> Meal Plan</TabsTrigger>
            <TabsTrigger value="about" className="gap-2"><FileJson className="w-4 h-4"/> About You</TabsTrigger>
            <TabsTrigger value="groceries" className="gap-2"><ListChecks className="w-4 h-4"/> Groceries</TabsTrigger>
            <TabsTrigger value="workouts" className="gap-2"><Dumbbell className="w-4 h-4"/> Workouts</TabsTrigger>
            <TabsTrigger value="trackers" className="gap-2"><BarChart3 className="w-4 h-4"/> Trackers</TabsTrigger>
          </TabsList>

          <TabsContent value="intake"><Intake api={api}/></TabsContent>
          <TabsContent value="meal"><MealPlan api={api}/></TabsContent>
          <TabsContent value="about"><AboutYou api={api}/></TabsContent>
          <TabsContent value="groceries"><GroceryList api={api}/></TabsContent>
          <TabsContent value="workouts"><Workouts/></TabsContent>
          <TabsContent value="trackers"><Trackers/></TabsContent>
          <TabsContent value="explorer"><ApiExplorer api={api}/></TabsContent>
        </Tabs>
      </main>

      <footer className="w-full px-6 py-8 text-center text-xs text-muted-foreground">
      </footer>
    </div>
  );
}
