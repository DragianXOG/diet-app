import React, { useEffect, useMemo, useState } from "react";
// Auth overlay removed for LAN-only mode
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
import {
  Loader2,
  Dumbbell,
  Utensils,
  ListChecks,
  Activity,
  Settings as SettingsIcon,
  FileJson,
  PlayCircle,
  RefreshCcw,
  Save,
  Download,
  Database,
  BarChart3,
  Drumstick,
  Milk,
  Egg,
} from "lucide-react";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* -----------------------------
   Local storage helpers
------------------------------ */
const ls = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

/* -----------------------------
   API client (supports VITE_API_BASE or host:port)
------------------------------ */
function useApi() {
  const initialBase = (() => {
    const fromEnv = (import.meta?.env && import.meta.env.VITE_API_BASE) || "";
    const urlParam = new URLSearchParams(window.location.search).get("api");
    const lsBase = localStorage.getItem("diet.app.base");
    const def = `${window.location.protocol}//${window.location.hostname}:8010`;
    return fromEnv || urlParam || lsBase || def;
  })();

  const [baseUrl, setBaseUrl] = useState(() =>
    ls.get("diet.baseUrl", initialBase)
  );
  const [userId, setUserId] = useState(() => ls.get("diet.userId", ""));

  useEffect(() => {
    ls.set("diet.baseUrl", baseUrl);
  }, [baseUrl]);
  useEffect(() => {
    ls.set("diet.userId", userId);
  }, [userId]);

  // Listen for external auth/base events (optional overlay)
  useEffect(() => {
    function onBase(e) {
      const fallback = `${window.location.protocol}//${window.location.hostname}:8010`;
      setBaseUrl(e.detail || localStorage.getItem("diet.app.base") || fallback);
    }
    window.addEventListener("diet.base", onBase);
    return () => {
      window.removeEventListener("diet.base", onBase);
    };
  }, []);

  // No token-based user fetch in LAN-only mode

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    const base = String(baseUrl || "").replace(/\/$/, "");
    let p = path.startsWith("/") ? path : `/${path}`;
    const baseHasApi = /\/api\/v1$/i.test(base);
    const pathHasApi = /^\/api\/v1(\/|$)/i.test(p);
    if (baseHasApi && pathHasApi) {
      p = p.replace(/^\/api\/v1/i, "");
      if (!p.startsWith("/")) p = `/${p}`;
    }
    return `${base}${p}`;
  }

  async function request(path, { method = "GET", body, headers } = {}) {
    // Use relative /api/* when provided to allow cookie-based session via proxy
    const url = /^\/api\//.test(path) ? path : buildUrl(path);
    const opts = {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      credentials: 'include',
      ...(body != null ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    };
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      const msg = json?.detail || json?.message || text || `HTTP ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return json ?? text;
  }

  return { baseUrl, setBaseUrl, userId, setUserId, request };
}

/* -----------------------------
   Utilities: JSON view & file download
------------------------------ */
function JsonView({ data }) {
  if (data == null)
    return <div className="text-muted-foreground text-sm">No data</div>;
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="bg-muted rounded-xl p-4 text-sm overflow-auto max-h-[50vh]">
      <code>{str}</code>
    </pre>
  );
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* -----------------------------
   Settings Panel
------------------------------ */
function SettingsPanel({ api }) {
  const [ping, setPing] = useState(null);
  const [checking, setChecking] = useState(false);

  async function healthCheck() {
    setChecking(true);
    try {
      const candidates = [
        "/api/v1/status",
        "/api/v1/health",
        "/health",
        "/status",
        "/openapi.json",
        "/docs",
      ];
      for (const p of candidates) {
        try {
          const data = await api.request(p);
          setPing({ path: p, data });
          setChecking(false);
          return;
        } catch {
          /* try next */
        }
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
        <CardTitle className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5" />
          API Settings
        </CardTitle>
        <CardDescription>
          Point this UI to your Diet‑App API base. Values are saved locally. Supports <code>VITE_API_BASE</code> or host:port defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Base URL</Label>
            <Input
              value={api.baseUrl}
              onChange={(e) => api.setBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8010 or http://127.0.0.1:8010/api/v1"
            />
          </div>
          <div className="grid gap-2">
            <Label>User ID</Label>
            <Input
              value={api.userId}
              onChange={(e) => api.setUserId(e.target.value)}
              placeholder="e.g., 1"
            />
          </div>
        </div>
        <div className="grid gap-2">
          {/* Token removed in LAN-only mode */}
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={healthCheck} disabled={checking}>
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
            Check API
          </Button>
          {ping?.path && <Badge variant="secondary">Responded: {ping.path}</Badge>}
        </div>
        {ping && <JsonView data={ping.error ? { error: ping.error } : ping.data} />}
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   API Explorer (manual requests)
------------------------------ */
function ApiExplorer({ api }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/api/v1/openapi.json");
  const [body, setBody] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  async function send() {
    setLoading(true);
    setResp(null);
    try {
      const needsBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      const payload = needsBody && body.trim() ? JSON.parse(body) : undefined;
      const data = await api.request(path, { method, body: payload });
      setResp({ ok: true, data });
    } catch (e) {
      setResp({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Database className="w-5 h-5" />
          API Explorer
        </CardTitle>
        <CardDescription>Call any endpoint on your API while it evolves.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="grid gap-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 grid gap-1">
            <Label>Path</Label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/v1/status" />
          </div>
        </div>
        {["POST", "PUT", "PATCH", "DELETE"].includes(method) && (
          <div className="grid gap-1">
            <Label>JSON Body</Label>
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"name":"eggs","quantity":12,"unit":"ct"}'
            />
          </div>
        )}
        <div className="flex gap-4">
          <Button onClick={send} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Send
          </Button>
          {resp && <Badge variant={resp.ok ? "default" : "destructive"}>{resp.ok ? "Success" : "Error"}</Badge>}
        </div>
        {resp && <JsonView data={resp.ok ? resp.data : { error: resp.error }} />}
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   Pricing Panel (integrated in Groceries)
------------------------------ */
function PricingPanel({ api }) {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState(null);
  const [error, setError] = useState("");

  const fmt = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(2)}` : "—");

  const items = (preview?.items || []).map((it) => {
    const u = Number(it?.unit_price ?? 0);
    const t = Number(it?.total_price ?? 0);
    const qty = u > 0 ? Number((t / u).toFixed(2)) : null;
    return { ...it, _qty: qty };
  });
  const totals = preview?.totals || {};
  const grand = preview?.grand_total;

  async function previewPrices() {
    setError("");
    setAssignResult(null);
    setLoadingPreview(true);
    try {
      const data = await api.request("/api/v1/groceries/price_preview");
      setPreview(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function assignPrices() {
    setError("");
    setAssignResult(null);
    setAssigning(true);
    try {
      const data = await api.request("/api/v1/groceries/price_assign", { method: "POST", body: {} });
      setAssignResult(data);
      // Soft refresh preview
      try {
        const refreshed = await api.request("/api/v1/groceries/price_preview");
        setPreview(refreshed);
      } catch {}
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section
      aria-labelledby="pricing-heading"
      className="pricing-panel"
      style={{ borderTop: "1px solid #e5e7eb", marginTop: "1rem", paddingTop: "1rem" }}
      aria-busy={loadingPreview || assigning ? "true" : "false"}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <h3 id="pricing-heading" style={{ margin: 0 }}>
          Pricing
        </h3>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {loadingPreview ? "Previewing prices…" : assigning ? "Assigning prices…" : ""}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        Prices are estimates and may vary by store/location; no guarantees. Informational only — not
        medical/nutrition advice.
      </p>

      <div className="flex gap-2 flex-wrap mt-2">
        <Button onClick={previewPrices} disabled={loadingPreview || assigning}>
          {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Preview prices
        </Button>
        <Button onClick={assignPrices} disabled={assigning || loadingPreview} variant="secondary">
          {assigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Assign prices
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md px-3 py-2"
          style={{ background: "#fef2f2", color: "#991b1b" }}
        >
          {error}
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Item</th>
              <th className="text-left p-3">Suggested store</th>
              <th className="text-right p-3">Unit price</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {preview ? "No items found in preview." : "Run “Preview prices” to see estimates."}
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id ?? it.name} className="border-t">
                  <td className="p-3">{it.name}</td>
                  <td className="p-3">{it.suggested_store || "—"}</td>
                  <td className="p-3 text-right">{fmt(it.unit_price)}</td>
                  <td className="p-3 text-right">{it._qty ?? "—"}</td>
                  <td className="p-3 text-right">{fmt(it.total_price)}</td>
                </tr>
              ))
            )}
          </tbody>
          {preview && (
            <tfoot>
              {Object.entries(totals).map(([store, sum]) => (
                <tr key={`store-${store}`} className="border-t-2">
                  <td className="p-3 text-right font-semibold" colSpan={4}>
                    {store || "Unassigned store"}
                  </td>
                  <td className="p-3 text-right font-semibold">{fmt(sum)}</td>
                </tr>
              ))}
              <tr className="border-t-2">
                <td className="p-3 text-right font-bold" colSpan={4}>
                  Grand total
                </td>
                <td className="p-3 text-right font-bold">{fmt(grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {assignResult?.persist?.backend === "file" && (
        <p className="text-xs text-muted-foreground mt-2">
          Pricing persisted via file fallback:
          <code className="ml-1">{assignResult?.persist?.path || "data/prices/user-{id}.json"}</code>
        </p>
      )}
    </section>
  );
}

/* -----------------------------
   Groceries (list + API sync + Pricing)
------------------------------ */
function GroceryList({ api }) {
  const [items, setItems] = useState(() => ls.get("diet.groceries", []));
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => ls.set("diet.groceries", items), [items]);

  function addLocal(item) {
    setItems((prev) => [{ id: Date.now(), purchased: false, ...item }, ...prev]);
  }

  async function loadFromApi() {
    setLoading(true);
    setStatus("");
    try {
      const data = await api.request("/api/v1/groceries");
      setItems(Array.isArray(data) ? data : []);
      setStatus("Loaded from /api/v1/groceries");
    } catch (e) {
      setStatus("Could not load /api/v1/groceries; using local list only.");
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    const item = {
      name: name.trim(),
      quantity: Number(quantity) || 1,
      unit: unit || undefined,
    };
    if (!item.name) return;
    setName("");
    setQuantity("1");
    setUnit("");
    addLocal(item);
    try {
      await api.request("/api/v1/groceries", { method: "POST", body: item });
      setStatus("Synced to /api/v1/groceries");
    } catch {
      setStatus("Saved locally (API unavailable)");
    }
  }

  async function togglePurchased(id, current) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, purchased: !current } : it)));
    try {
      await api.request(`/api/v1/groceries/${id}`, {
        method: "PATCH",
        body: { purchased: !current },
      });
    } catch {}
  }

  // Note: DELETE is not part of the contract; we only remove locally.
  function removeLocal(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Build groceries from current week (7 days) via server sync
  async function buildFromMeals(days = 7, replace = true) {
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    try {
      const now = Date.now();
      const start = iso(now);
      const end = iso(now + (days - 1) * 24 * 60 * 60 * 1000);
      setStatus(`Building from meal plan ${start}..${end}…`);
      await api.request(
        `/api/v1/groceries/sync_from_meals?start=${start}&end=${end}&persist=true&clear_existing=${replace}&seed_if_empty=false`,
        { method: "POST" }
      );
      const data = await api.request("/api/v1/groceries");
      setItems(Array.isArray(data) ? data : []);
      setStatus(`Built from meal plan (${data?.length || 0} items)`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to build from meal plan.");
    }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <ListChecks className="w-5 h-5" />
          Groceries
        </CardTitle>
        <CardDescription>
          Add items, check them off, sync with the API, and preview/assign pricing estimates.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="grid gap-1">
            <Label>Item</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="eggs, milk, chicken"
            />
          </div>
          <div className="grid gap-1">
            <Label>Qty</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ct, gallon, lb" />
          </div>
          <div className="flex items-end gap-3">
            <Button onClick={add}>
              <Save className="w-4 h-4 mr-2" />
              Add
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const headers = ["id", "name", "quantity", "unit", "purchased", "created_at"];
                const rows = items
                  .map((x) => headers.map((h) => JSON.stringify(x[h] ?? "")).join(","))
                  .join("\n");
                downloadTextFile(
                  `grocery-list-${new Date().toISOString().slice(0, 10)}.csv`,
                  headers.join(",") + "\n" + rows
                );
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadFromApi} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Sync from API
          </Button>
          <Button variant="default" onClick={() => buildFromMeals(7, true)}>
            Build from Meal Plan (7 days)
          </Button>
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
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-3">
                    <Checkbox
                      checked={!!it.purchased}
                      onCheckedChange={() => togglePurchased(it.id, !!it.purchased)}
                    />
                  </td>
                  <td className="p-3 font-medium flex items-center gap-2">
                    {it.name}
                    {/^egg/i.test(it.name) && <Egg className="w-4 h-4" />}
                    {/^milk/i.test(it.name) && <Milk className="w-4 h-4" />}
                    {/(beef|steak|ground)/i.test(it.name) && <Drumstick className="w-4 h-4" />}
                  </td>
                  <td className="p-3">{it.quantity ?? 1}</td>
                  <td className="p-3">{it.unit ?? ""}</td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => removeLocal(it.id)}>
                      Remove (local)
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No items yet – add your first above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pricing integration */}
        <PricingPanel api={api} />
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   About You (Intake)
------------------------------ */
function AboutYou({ api }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    name: "",
    age: "",
    sex: "",
    height_in: "",
    weight_lb: "",
    diabetic: false,
    conditions: "",
    meds: "",
    goals: "",
    zip: "",
    gym: "",
    workout_days_per_week: "",
    workout_session_min: "",
    meals_per_day: "",
    food_notes: "",
    workout_notes: "",
  });

  useEffect(() => {
    (async () => {
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
            workout_days_per_week: (data.workout_days_per_week ?? "") === null ? "" : String(data.workout_days_per_week ?? ""),
            workout_session_min: (data.workout_session_min ?? "") === null ? "" : String(data.workout_session_min ?? ""),
            meals_per_day: (data.meals_per_day ?? "") === null ? "" : String(data.meals_per_day ?? ""),
            food_notes: data.food_notes ?? "",
            workout_notes: data.workout_notes ?? "",
          });
          setStatus("Loaded your intake");
        } else {
          setStatus("No intake yet — fill it out and submit.");
        }
      } catch {
        setStatus("Could not load intake yet.");
      } finally {
        setLoading(false);
      }
    })();
  }, [api.baseUrl]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

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
    setErr("");
    setStatus("");
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
      payload.age = payload.age ? Number(payload.age) : undefined;
      payload.height_in = payload.height_in ? Number(payload.height_in) : undefined;
      payload.weight_lb = payload.weight_lb ? Number(payload.weight_lb) : undefined;
      if (form.meals_per_day && !Number.isNaN(Number(form.meals_per_day))) {
        payload.meals_per_day = Number(form.meals_per_day);
      } else {
        delete payload.meals_per_day;
      }
      if (form.workout_days_per_week && !Number.isNaN(Number(form.workout_days_per_week))) {
        payload.workout_days_per_week = Number(form.workout_days_per_week);
      }
      if (form.workout_session_min && !Number.isNaN(Number(form.workout_session_min))) {
        payload.workout_session_min = Number(form.workout_session_min);
      }

      await api.request("/api/v1/intake", { method: "POST", body: payload });
      setStatus("Saved.");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <FileJson className="w-5 h-5" />
          About You
        </CardTitle>
        <CardDescription>
          This information personalizes your plan. You can update it anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {typeof window !== 'undefined' && localStorage.getItem('diet.updateNote') === '1' && (
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            Please update this as often as necessary to keep your app working best for you.
          </div>
        )}
        {loading && <div>Loading…</div>}
        {!!err && <div className="text-red-600 text-sm">{err}</div>}
        {!!status && <div className="text-sm text-muted-foreground">{status}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Your name" />
          </div>
          <div className="grid gap-1">
            <Label>Age</Label>
            <Input
              type="number"
              value={form.age}
              onChange={(e) => setField("age", e.target.value)}
              placeholder="e.g., 34"
            />
          </div>
          <div className="grid gap-1">
            <Label>Sex</Label>
            <div className="flex items-center gap-4 py-2">
              {[
                {v:'M', label:'Male'},
                {v:'F', label:'Female'},
                {v:'O', label:'Other / Prefer not to say'},
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="about-sex" value={opt.v} checked={form.sex===opt.v} onChange={e=>setField('sex', e.target.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Height (inches)</Label>
            <Input
              type="number"
              value={form.height_in}
              onChange={(e) => setField("height_in", e.target.value)}
              placeholder="e.g., 70"
            />
          </div>
          <div className="grid gap-1">
            <Label>Weight (lb)</Label>
            <Input
              type="number"
              value={form.weight_lb}
              onChange={(e) => setField("weight_lb", e.target.value)}
              placeholder="e.g., 190"
            />
          </div>
          <div className="grid gap-1">
            <Label>ZIP / Location</Label>
            <Input value={form.zip || ""} onChange={(e) => setField("zip", e.target.value)} placeholder="optional" />
          </div>
          <div className="grid gap-1">
            <Label>Gym</Label>
            <Input value={form.gym || ""} onChange={(e) => setField("gym", e.target.value)} placeholder="Crunch" />
          </div>
          <div className="grid gap-1">
            <Label>Workout days per week</Label>
            <Select value={form.workout_days_per_week || ""} onValueChange={(v) => setField("workout_days_per_week", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {[...Array(7)].map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Session length (minutes)</Label>
            <Select value={form.workout_session_min || ""} onValueChange={(v) => setField("workout_session_min", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {[15, 30, 45, 60, 75, 90, 105, 120].map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Meals per day</Label>
            <Input type="number" min={2} max={6} value={form.meals_per_day}
                   onChange={(e)=> setField('meals_per_day', e.target.value)} placeholder="e.g., 3 or 5" />
            <p className="text-xs text-muted-foreground">Optional: 2–6 meals/day. Planner will honor this.</p>
          </div>
          <div className="grid gap-1">
            <Label>Diabetic</Label>
            <div className="flex items-center gap-4 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="about-diabetic" value="yes" checked={!!form.diabetic===true}
                       onChange={()=> setField('diabetic', true)} />
                <span>Yes</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="about-diabetic" value="no" checked={!!form.diabetic===false}
                       onChange={()=> setField('diabetic', false)} />
                <span>No</span>
              </label>
            </div>
          </div>
        </div>

        <div className="grid gap-1">
          <Label>Health Conditions & Meds</Label>
          <Textarea
            rows={3}
            value={form.conditions}
            onChange={(e) => setField("conditions", e.target.value)}
            placeholder="e.g., hypertension, meds list…"
          />
        </div>

        <div className="grid gap-1">
          <Label>Goals</Label>
          <Textarea
            rows={3}
            value={form.goals}
            onChange={(e) => setField("goals", e.target.value)}
            placeholder="e.g., Lose 15 lb in 8 weeks; improve A1C; feel more energetic"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Tip: Include timelines (e.g., “in 8 weeks”) so we can tailor pace and warnings.
          </p>
        </div>

        <div className="grid gap-1">
          <Label>Food choices (free‑form)</Label>
          <Textarea
            rows={5}
            value={form.food_notes}
            onChange={(e) => setField("food_notes", e.target.value)}
            placeholder={
              "Examples:\n• Prefer 15–20 min meals; dislike cilantro; limit dairy\n• Usually 3 meals/day; ok with salmon & chicken; avoid pork\n• Like Mediterranean flavors; pantry staples only Mon–Thu"
            }
          />
          <p className="text-sm text-muted-foreground mt-1">
            Describe preferences, dislikes, time available, and meals/day. This guides your plan.
          </p>
        </div>

        <div className="grid gap-1">
          <Label>Workout preferences & constraints</Label>
          <Textarea
            rows={5}
            value={form.workout_notes}
            onChange={(e) => setField("workout_notes", e.target.value)}
            placeholder={
              "Examples:\n• Home only; adjustable dumbbells to 50 lb, bands\n• Prefer yoga & calisthenics; injured shoulder—avoid overhead pressing\n• Gym: PF (Smith ok); 4x/week 30–45 min"
            }
          />
        </div>

        <div className="flex gap-3">
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -----------------------------
  Meal Plan (generate + history)
------------------------------ */
function MealPlan({ api }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [open, setOpen] = useState({}); // recipe expand toggles
  const keyFor = (i, k) => `${i}-${k}`;
  const isOpen = (i, k) => !!open[keyFor(i, k)];
  const toggle = (i, k) => setOpen((prev) => ({ ...prev, [keyFor(i, k)]: !prev[keyFor(i, k)] }));

  const [viewMode, setViewMode] = useState("current"); // 'current' | 'history'
  const [plans, setPlans] = useState(null); // GET /plans list
  const [historyLoading, setHistoryLoading] = useState(false);

  function windowFromPlan(p) {
    if (!p?.days || p.days.length === 0) return null;
    if (p.window?.start && p.window?.end) return p.window;
    const dates = p.days.map((d) => d.day).filter(Boolean).sort();
    if (dates.length === 0) return null;
    return { start: dates[0], end: dates[dates.length - 1] };
    }

  async function buildGroceriesForPlan() {
    const win = windowFromPlan(plan);
    if (!win) {
      setStatus("No window for this plan.");
      return;
    }
    try {
      setStatus(`Building groceries for ${win.start}..${win.end}…`);
      await api.request(
        `/api/v1/groceries/sync_from_meals?start=${win.start}&end=${win.end}&persist=true&clear_existing=true&seed_if_empty=false`,
        { method: "POST" }
      );
      setStatus("Groceries built for this plan.");
    } catch (e) {
      console.error(e);
      setStatus("Failed to build groceries for this plan.");
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const list = await api.request("/api/v1/plans");
      setPlans(list);
      if (!list || list.length === 0) setStatus("No saved plans yet.");
    } catch (e) {
      console.error(e);
      setStatus("Failed to load plan history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistory(start) {
    try {
      const data = await api.request(`/api/v1/plans/${start}`);
      const days = (data.days || []).map((d) => ({
        day: d.date,
        meals: d.meals.map((m) => ({
          time: m.time,
          title: m.title,
          carbs: m.carbs ?? null,
          kcal: m.kcal ?? null,
          ingredients: m.ingredients || [],
          steps: m.steps || [],
        })),
      }));
      setPlan({ week: 1, days, window: data.window });
      setStatus(`Loaded saved plan (${data.window?.start}..${data.window?.end})`);
      setViewMode("history"); // stay in history view showing details below
    } catch (e) {
      console.error(e);
      setStatus("Failed to load saved plan.");
    }
  }

  async function generatePlan() {
    setLoading(true);
    setStatus("Checking preferences and goals…");
    try {
      const rz = await api.request("/api/v1/intake/rationalize", { method: "POST" });
      let confirmFlag = false;
      if (rz?.safety_required) {
        const warn = (rz.warnings || []).join("\n• ");
        const ok = confirm(
          `⚠️ Safety check\n\nThis plan looks aggressive:\n• ${warn}\n\nProceed anyway?`
        );
        if (!ok) {
          setStatus("Cancelled.");
          setLoading(false);
          return;
        }
        confirmFlag = true;
      }
      setStatus(`Generating ${rz.meals_per_day || 2} meals/day plan…`);
      const resp = await api.request("/api/v1/plans/generate", {
        method: "POST",
        body: { days: 7, persist: true, include_recipes: true, confirm: confirmFlag },
      });
      const days = (resp.days || []).map((d) => ({
        day: d.date,
        meals: d.meals.map((m) => ({
          time: m.time,
          title: m.title,
          carbs: m.carbs ?? null,
          kcal: m.kcal ?? null,
          ingredients: m.ingredients || [],
          steps: m.steps || [],
        })),
      }));
      setPlan({ week: 1, days, window: resp.window });
      setStatus("Generated on server");
      setViewMode("current");
    } catch (e) {
      console.error(e);
      setStatus("Failed to generate plan.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!plan?.days) return;
    const rows = [["day", "time", "title", "carbs", "kcal"]].concat(
      plan.days.flatMap((d) =>
        d.meals.map((m) => [d.day, m.time, m.title, m.carbs ?? "", m.kcal ?? ""])
      )
    );
    const text = rows.map((r) => r.map((x) => JSON.stringify(x ?? "")).join(",")).join("\n");
    downloadTextFile(`meal-plan-week-${plan.week || "x"}.csv`, text);
  }

  // Demo placeholder if no plan yet
  const demoPlan =
    plan ||
    {
      week: 1,
      days: [
        {
          day: "Mon",
          meals: [
            { time: "12:00", title: "Egg scramble", carbs: 6, kcal: 420 },
            { time: "18:00", title: "Grilled chicken + salad", carbs: 10, kcal: 520 },
          ],
        },
        {
          day: "Tue",
          meals: [
            { time: "12:00", title: "Greek yogurt + walnuts", carbs: 9, kcal: 380 },
            { time: "18:00", title: "Beef stir‑fry (cauli rice)", carbs: 11, kcal: 560 },
          ],
        },
        {
          day: "Wed",
          meals: [
            { time: "12:00", title: "Tuna avocado boats", carbs: 5, kcal: 430 },
            { time: "18:00", title: "Turkey lettuce tacos", carbs: 12, kcal: 540 },
          ],
        },
        {
          day: "Thu",
          meals: [
            { time: "12:00", title: "Protein shake", carbs: 7, kcal: 350 },
            { time: "18:00", title: "Pork chops + green beans", carbs: 9, kcal: 570 },
          ],
        },
        {
          day: "Fri",
          meals: [
            { time: "12:00", title: "Cottage cheese bowl", carbs: 8, kcal: 360 },
            { time: "18:00", title: "Salmon + asparagus", carbs: 6, kcal: 550 },
          ],
        },
        {
          day: "Sat",
          meals: [
            { time: "12:00", title: "Chicken Caesar salad", carbs: 10, kcal: 480 },
            { time: "18:00", title: "Burger (no bun) + slaw", carbs: 14, kcal: 590 },
          ],
        },
        {
          day: "Sun",
          meals: [
            { time: "12:00", title: "Omelet + spinach", carbs: 7, kcal: 410 },
            { time: "18:00", title: "Roast chicken + veg", carbs: 12, kcal: 560 },
          ],
        },
      ],
    };

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Utensils className="w-5 h-5" />
          Meal Plan
        </CardTitle>
        <CardDescription>Generate a 7‑day plan, browse history, and export.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={generatePlan} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <>✨&nbsp;</>}
            Generate 7‑Day Plan
          </Button>
          {plan && (
            <>
              <Button variant="secondary" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={buildGroceriesForPlan}>
                🛒 Build Groceries for This Plan
              </Button>
            </>
          )}
          {status && <Badge variant="secondary">{status}</Badge>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={viewMode === "current" ? "default" : "outline"}
            onClick={() => setViewMode("current")}
          >
            Current
          </Button>
          <Button
            variant={viewMode === "history" ? "default" : "outline"}
            onClick={() => {
              setViewMode("history");
              if (!plans) loadHistory();
            }}
          >
            History
          </Button>
        </div>

        {viewMode === "history" ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={loadHistory} disabled={historyLoading}>
                {historyLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcw className="w-4 h-4 mr-2" />
                )}
                Refresh History
              </Button>
              {status && <Badge variant="secondary">{status}</Badge>}
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Start</th>
                    <th className="text-left p-3">End</th>
                    <th className="text-left p-3">Diet</th>
                    <th className="text-left p-3">Meals/day</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(plans) && plans.length > 0 ? (
                    plans.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{p.start}</td>
                        <td className="p-3">{p.end}</td>
                        <td className="p-3">{p.diet_label || "—"}</td>
                        <td className="p-3">{p.meals_per_day ?? "—"}</td>
                        <td className="p-3">
                          <Button size="sm" variant="ghost" onClick={() => openHistory(p.start)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        No saved plans yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {plan ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plan.days?.map((d, i) => (
                  <div key={i} className="rounded-xl border p-0">
                    <div className="p-3">
                      <div className="text-base font-semibold">{d.day}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.meals?.length ?? 0} meals
                      </div>
                    </div>
                    <div className="grid gap-3 p-3">
                      {d.meals?.map((m, k) => (
                        <div key={k} className="rounded-xl border p-3">
                          <div className="text-xs text-muted-foreground">{m.time}</div>
                          <div className="font-medium">{m.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.carbs != null && (
                              <>
                                Carbs: <b>{m.carbs} g</b>
                              </>
                            )}{" "}
                            {m.kcal != null && <> · {m.kcal} kcal</>}
                          </div>
                          {m.ingredients && m.ingredients.length > 0 && (
                            <button className="text-xs underline mt-1" onClick={() => toggle(i, k)}>
                              {isOpen(i, k) ? "Hide recipe" : "Show recipe"}
                            </button>
                          )}
                          {isOpen(i, k) && (
                            <div className="mt-2 text-sm">
                              <div className="font-medium mb-1">Ingredients</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {m.ingredients.map((ing, idx) => (
                                  <li key={idx}>
                                    {typeof ing === 'string'
                                      ? ing
                                      : `${ing.quantity ?? ''}${ing.unit ? ' ' + ing.unit : ''}${ing.quantity || ing.unit ? ' ' : ''}${ing.name ?? ''}`.trim()}
                                  </li>
                                ))}
                              </ul>
                              {m.steps && m.steps.length > 0 && (
                                <>
                                  <div className="font-medium mt-3 mb-1">Steps</div>
                                  <ol className="list-decimal pl-5 space-y-1">
                                    {m.steps.map((s, idx) => (
                                      <li key={idx}>{s}</li>
                                    ))}
                                  </ol>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Select a saved plan to preview.</div>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {demoPlan.days?.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{d.day}</CardTitle>
                    <CardDescription>{d.meals?.length ?? 0} meals</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {d.meals?.map((m, k) => (
                      <div key={k} className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">{m.time}</div>
                        <div className="font-medium">{m.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.carbs != null && (
                            <>
                              Carbs: <b>{m.carbs} g</b>
                            </>
                          )}{" "}
                          {m.kcal != null && <> · {m.kcal} kcal</>}
                        </div>
                        {m.ingredients && m.ingredients.length > 0 && (
                          <button className="text-xs underline mt-1" onClick={() => toggle(i, k)}>
                            {isOpen(i, k) ? "Hide recipe" : "Show recipe"}
                          </button>
                        )}
                        {isOpen(i, k) && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Ingredients</div>
                            <ul className="list-disc pl-5 space-y-1">
                              {m.ingredients.map((ing, idx) => (
                                <li key={idx}>
                                  {typeof ing === 'string'
                                    ? ing
                                    : `${ing.quantity ?? ''}${ing.unit ? ' ' + ing.unit : ''}${ing.quantity || ing.unit ? ' ' : ''}${ing.name ?? ''}`.trim()}
                                </li>
                              ))}
                            </ul>
                            {m.steps && m.steps.length > 0 && (
                              <>
                                <div className="font-medium mt-3 mb-1">Steps</div>
                                <ol className="list-decimal pl-5 space-y-1">
                                  {m.steps.map((s, idx) => (
                                    <li key={idx}>{s}</li>
                                  ))}
                                </ol>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   Workout Plan (generate + track)
------------------------------ */
function WorkoutPlan({ api }) {
  const [workouts, setWorkouts] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState({});
  const keyFor = (sid) => `s-${sid}`;
  const toggle = (sid) => setOpen((p)=> ({...p, [keyFor(sid)]: !p[keyFor(sid)] }));

  async function loadWeek() {
    setLoading(true);
    try {
      const today = new Date();
      const iso = (d)=> d.toISOString().slice(0,10);
      const start = iso(today);
      const end = iso(new Date(today.getTime() + 6*24*60*60*1000));
      const data = await api.request(`/api/v1/workouts?start=${start}&end=${end}`);
      setWorkouts(Array.isArray(data)? data: []);
      setStatus(`Loaded ${data?.length || 0} sessions`);
    } catch (e) {
      setStatus("Could not load workouts");
    } finally { setLoading(false); }
  }

  async function generateWeek() {
    setLoading(true);
    setStatus("Generating workouts…");
    try {
      await api.request('/api/v1/workouts/generate', { method:'POST', body:{ days: 7, persist: true }});
      await loadWeek();
      setStatus("Generated for this week");
    } catch (e) {
      console.error(e);
      setStatus("Failed to generate workouts");
    } finally { setLoading(false); }
  }

  async function markExercise(exId, complete) {
    try {
      await api.request(`/api/v1/workouts/exercises/${exId}`, { method:'PATCH', body:{ complete }});
      await loadWeek();
    } catch {}
  }

  useEffect(()=> { loadWeek(); }, []);

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Dumbbell className="w-5 h-5" />
          Workout Plan
        </CardTitle>
        <CardDescription>Generate a 7‑day workout plan based on your preferences. Track completion per exercise.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={generateWeek} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <>🏋️&nbsp;</>}
            Generate 7‑Day Workouts
          </Button>
          <Button variant="secondary" onClick={loadWeek} disabled={loading}>Refresh</Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
        {workouts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No workouts yet. Generate a plan above.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workouts.map((w) => (
              <div key={w.id} className="rounded-xl border overflow-hidden">
                <div className="p-3">
                  <div className="text-base font-semibold">{w.title} — {w.date}</div>
                  <div className="text-xs text-muted-foreground">{w.location || 'Unspecified location'}</div>
                </div>
                <div className="p-3 grid gap-2">
                  {w.exercises?.map((e) => (
                    <div key={e.id} className="rounded-lg border p-2 flex items-start gap-3">
                      <input type="checkbox" className="mt-1" checked={!!e.complete} onChange={(ev)=> markExercise(e.id, ev.target.checked)} />
                      <div className="grid gap-0.5">
                        <div className="font-medium text-sm">{e.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.machine ? `${e.machine} · ` : ''}
                          {e.sets ? `${e.sets}×` : ''}{e.reps ?? ''}{e.target_weight ? ` @ ${e.target_weight} lb` : ''}
                          {e.rest_sec ? ` · rest ${e.rest_sec}s` : ''}
                        </div>
                        {(e.actual_reps != null || e.actual_weight != null) && (
                          <div className="text-xs">
                            Done: {e.actual_reps ?? '-'} reps @ {e.actual_weight ?? '-'} lb
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
/* -----------------------------
   Trackers (weight + glucose)
------------------------------ */
function Trackers() {
  const [entries, setEntries] = useState(() => ls.get("diet.track", []));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [glucose, setGlucose] = useState("");

  useEffect(() => ls.set("diet.track", entries), [entries]);

  function add() {
    if (!weight && !glucose) return;
    setEntries((prev) => [
      ...prev,
      { date, weight: weight ? Number(weight) : null, glucose: glucose ? Number(glucose) : null },
    ]);
    setWeight("");
    setGlucose("");
  }

  function exportCsv() {
    const headers = ["date", "weight", "glucose"];
    const rows = entries.map((x) => headers.map((h) => JSON.stringify(x[h] ?? "")).join(",")).join("\n");
    downloadTextFile(`trackers-${new Date().toISOString().slice(0, 10)}.csv`, headers.join(",") + "\n" + rows);
  }

  const weightData = entries.filter((e) => e.weight != null);
  const glucoseData = entries.filter((e) => e.glucose != null);

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5" />
          Trackers
        </CardTitle>
        <CardDescription>Log daily weight and glucose; view basics and export CSV.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="grid gap-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Weight (lb)</Label>
            <Input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="295"
            />
          </div>
          <div className="grid gap-1">
            <Label>Glucose (mg/dL)</Label>
            <Input
              type="number"
              value={glucose}
              onChange={(e) => setGlucose(e.target.value)}
              placeholder="120"
            />
          </div>
          <div className="flex items-end gap-3">
            <Button onClick={add}>
              <Save className="w-4 h-4 mr-2" />
              Add
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 border rounded-xl p-2">
            <div className="text-sm text-muted-foreground mb-2">Weight</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis domain={["auto", "auto"]} />
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
                <XAxis dataKey="date" hide />
                <YAxis domain={["auto", "auto"]} />
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
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground">
                    No entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   Workouts (stub)
------------------------------ */
function Workouts() {
  const [note, setNote] = useState("");
  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Dumbbell className="w-5 h-5" />
          Workouts
        </CardTitle>
        <CardDescription>Starter workouts stub. Log a quick note below.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <Label>Workout note</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Leg press 3×15 @ 250 lb"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          We’ll replace this with machine‑level plans next.
        </div>
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   Root App
------------------------------ */
export default function App() {
  const api = useApi();
  const [active, setActive] = useState("meal");

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#48A860] text-white border-b shadow">
        <div className="w-full px-6 py-4 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white ml-2">
              Life – Health
            </h1>
            <motion.div initial={{ rotate: -8 }} animate={{ rotate: 0 }}>
              <Utensils className="w-6 h-6" />
            </motion.div>
            <div>
              <div className="font-bold leading-tight">Diet‑App Frontend</div>
            </div>
          </div>
        </div>
      </header>

      {/* Auth overlay removed for LAN-only mode */}

      <main className="w-full px-6 py-6 md:py-8 lg:py-10 grid gap-5 md:gap-8 lg:gap-10">
        <Tabs value={active} onValueChange={setActive} className="w-full">
          <TabsList className="flex flex-wrap gap-2">
            <TabsTrigger value="settings" className="gap-2">
              <SettingsIcon className="w-4 h-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="meal" className="gap-2">
              <Utensils className="w-4 h-4" /> Meal Plan
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-2">
              <FileJson className="w-4 h-4" /> About You
            </TabsTrigger>
            <TabsTrigger value="groceries" className="gap-2">
              <ListChecks className="w-4 h-4" /> Groceries
            </TabsTrigger>
            <TabsTrigger value="workouts" className="gap-2">
              <Dumbbell className="w-4 h-4" /> Workouts
            </TabsTrigger>
            <TabsTrigger value="trackers" className="gap-2">
              <BarChart3 className="w-4 h-4" /> Trackers
            </TabsTrigger>
            <TabsTrigger value="explorer" className="gap-2">
              <Database className="w-4 h-4" /> Explorer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsPanel api={api} />
          </TabsContent>
          <TabsContent value="meal">
            <MealPlan api={api} />
          </TabsContent>
          <TabsContent value="about">
            <AboutYou api={api} />
          </TabsContent>
          <TabsContent value="groceries">
            <GroceryList api={api} />
          </TabsContent>
          <TabsContent value="workouts">
            <WorkoutPlan api={api} />
          </TabsContent>
          <TabsContent value="trackers">
            <Trackers />
          </TabsContent>
          <TabsContent value="explorer">
            <ApiExplorer api={api} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="w-full px-6 py-8 text-center text-xs text-muted-foreground">
        <div>Informational only — not medical advice. Prices are estimates and may vary by store/location.</div>
      </footer>
    </div>
  );
}
