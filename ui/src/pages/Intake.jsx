import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}
async function apiRequest(path, { method = "GET", body, headers } = {}) {
  const url = path; // use relative /api/* for cookie-based auth via proxy
  const res = await fetch(url, {
    method,
    headers: {
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {})
    },
    credentials: 'include',
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [gdprOpen, setGdprOpen] = useState(false);
  const [gdprAgree, setGdprAgree] = useState({ consent: false, read: false });
  const [medOpen, setMedOpen] = useState(false);
  const [medAgree, setMedAgree] = useState(false);

  const [form, setForm] = useState({
    name: "", age: "", sex: "", height_in: "", weight_lb: "",
    diabetic: false, conditions: "", meds: "", goals: "", zip: "", gym: "",
    workout_days_per_week: "", workout_session_min: "", workout_time: "",
    meals_per_day: "",
    food_notes: "", workout_notes: ""
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Waiver + GDPR consent gates
  useEffect(() => {
    const med = localStorage.getItem('diet.medicalAccepted') === '1';
    if (!med) { setMedOpen(true); return; }
    const gdpr = localStorage.getItem('diet.gdprAccepted') === '1';
    if (!gdpr) setGdprOpen(true);
  }, []);

  function setField(k, v){ setForm(prev => ({ ...prev, [k]: v })); }
  function onBlurField(k){ setTouched(prev => ({ ...prev, [k]: true })); }

  function validate(f){
    const errs = {};
    const has = (x) => x != null && String(x).trim() !== "";
    const numOk = (x) => has(x) && !Number.isNaN(Number(x));
    if (!has(f.name)) errs.name = "Required";
    if (!numOk(f.age)) errs.age = "Enter a valid number";
    if (!has(f.sex)) errs.sex = "Required";
    if (!numOk(f.height_in)) errs.height_in = "Enter a valid number";
    if (!numOk(f.weight_lb)) errs.weight_lb = "Enter a valid number";
    if (!(f.diabetic === true || f.diabetic === false)) errs.diabetic = "Select Yes or No";
    if (!has(f.conditions)) errs.conditions = "Required";
    if (!has(f.meds)) errs.meds = "Required";
    if (!has(f.goals)) errs.goals = "Required";
    if (!has(f.zip)) errs.zip = "Required";
    if (!has(f.gym)) errs.gym = "Required";
    if (!has(f.food_notes)) errs.food_notes = "Required";
    if (!has(f.workout_notes)) errs.workout_notes = "Required";
    return errs;
  }

  useEffect(() => { setErrors(validate(form)); }, [form]);
  // Clear banner when errors resolved
  useEffect(() => {
    if (Object.keys(errors||{}).length === 0) setErr("");
  }, [errors]);

  // Safari/macOS autofill support: after mount, read DOM values if present
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const fields = [
          'name','age','height_in','weight_lb','zip','gym','conditions','meds','goals','food_notes','workout_notes'
        ];
        const updates = {};
        fields.forEach(id => {
          const el = document.getElementById(`intake-${id}`);
          if (el && typeof el.value === 'string' && el.value.trim() !== '' && String(form[id]||'') !== el.value) {
            updates[id] = el.value;
          }
        });
        if (Object.keys(updates).length) {
          setForm(prev => ({ ...prev, ...updates }));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValid = useMemo(() => Object.keys(errors || {}).length === 0, [errors]);

  async function onSubmit() {
    setErr("");
    try {
      // Skip blocking validation to allow testing flow to continue
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
      // Normalize optional numerics (only set when valid)
      payload.age = (form.age !== '' && !Number.isNaN(Number(form.age))) ? Number(form.age) : undefined;
      payload.height_in = (form.height_in !== '' && !Number.isNaN(Number(form.height_in))) ? Number(form.height_in) : undefined;
      payload.weight_lb = (form.weight_lb !== '' && !Number.isNaN(Number(form.weight_lb))) ? Number(form.weight_lb) : undefined;
      payload.diabetic = !!form.diabetic;
      // Send numeric meals_per_day to API
      if (form.meals_per_day && !Number.isNaN(Number(form.meals_per_day))) {
        payload.meals_per_day = Number(form.meals_per_day);
      }
      if (form.workout_days_per_week && !Number.isNaN(Number(form.workout_days_per_week))) {
        payload.workout_days_per_week = Number(form.workout_days_per_week);
      }
      if (form.workout_session_min && !Number.isNaN(Number(form.workout_session_min))) {
        payload.workout_session_min = Number(form.workout_session_min);
      }
      if (form.workout_time && /^\d{2}:\d{2}$/.test(form.workout_time)) {
        payload.workout_time = form.workout_time;
      }

      await apiRequest("/api/v1/intake", { method: "POST", body: payload });
      localStorage.setItem('diet.updateNote', '1');
      nav("/app");
    } catch (e) {
      // Log but do not block testing with a persistent banner
      console.error(e);
      setErr(String(e.message || e));
    } finally { setSaving(false); }
  }

  return (
    <main className="container mx-auto max-w-3xl p-6">
      {medOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="bg-white text-left max-w-xl w-full rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-2">Health & Fitness Disclosure</h2>
            <p className="text-sm text-gray-700 mb-4">
              These tools provide general wellness recommendations only and are not certified by a medical professional.
              Starting any new diet or exercise plan carries risk. You should always consult with a physician prior to
              beginning or changing your health regimen, and stop if you experience any pain, dizziness, or discomfort.
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={medAgree} onChange={(e)=>setMedAgree(e.target.checked)} />
              <span>I have read and understand this disclosure. I accept responsibility for consulting a medical professional.</span>
            </label>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={()=>{ setMedOpen(false); setMedAgree(false); }}>Cancel</Button>
              <Button onClick={()=>{ if(!medAgree) return; localStorage.setItem('diet.medicalAccepted','1'); setMedOpen(false); if(localStorage.getItem('diet.gdprAccepted') !== '1') setGdprOpen(true); }}>I Agree</Button>
            </div>
          </div>
        </div>
      )}
      {gdprOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="bg-white text-left max-w-xl w-full rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-2">GDPR/Data Processing Disclosure</h2>
            <p className="text-sm text-gray-700 mb-3">
              This app uses OpenAI to help generate your personalized plan. Your input data may be sent to OpenAI for
              processing. The app owners will not use your data outside of generating your plan. For details on how
              OpenAI processes data, please review the linked privacy statement.
            </p>
            <p className="text-sm text-gray-700 mb-4">
              By continuing, you consent to processing of your data for the purposes described. You may withdraw consent
              at any time by discontinuing use and requesting deletion.
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-800 mb-2">
              <input type="checkbox" checked={gdprAgree.consent} onChange={(e)=>setGdprAgree(s=>({...s, consent:e.target.checked}))} />
              <span>I consent to data processing for generating my plan.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={gdprAgree.read} onChange={(e)=>setGdprAgree(s=>({...s, read:e.target.checked}))} />
              <span>
                I have read and understand the <a href="/privacy" className="underline" target="_blank" rel="noreferrer">Privacy Policy</a>.
              </span>
            </label>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={()=>{ setGdprOpen(false); setGdprAgree({consent:false,read:false}); }}>Cancel</Button>
              <Button onClick={()=>{ if(!(gdprAgree.consent && gdprAgree.read)) return; localStorage.setItem('diet.gdprAccepted','1'); setGdprOpen(false); }}>I Agree</Button>
            </div>
          </div>
        </div>
      )}
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
              <Input id="intake-name" autoComplete="name" value={form.name} onChange={e=>{ setField("name", e.target.value); setTouched(p=>({...p,name:true})); }} onInput={e=>{ setField("name", e.target.value); }} onBlur={()=>onBlurField('name')} placeholder="Your name"/>
              {touched.name && errors.name && <div className="text-red-600 text-sm">{errors.name}</div>}
            </div>
            <div className="grid gap-1">
              <Label>Age</Label>
              <Input id="intake-age" type="number" inputMode="numeric" value={form.age} onChange={e=>{ setField("age", e.target.value); setTouched(p=>({...p,age:true})); }} onInput={e=>{ setField("age", e.target.value); }} onBlur={()=>onBlurField('age')} placeholder="e.g., 34"/>
              {touched.age && errors.age && <div className="text-red-600 text-sm">{errors.age}</div>}
            </div>
            <div className="grid gap-1">
              <Label>Sex</Label>
              <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sex"
                    value="M"
                    checked={form.sex === 'M'}
                    onChange={(e)=>{ setField('sex', e.target.value); setTouched(prev=>({...prev, sex:true})); }}
                  />
                  <span>Male</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sex"
                    value="F"
                    checked={form.sex === 'F'}
                    onChange={(e)=>{ setField('sex', e.target.value); setTouched(prev=>({...prev, sex:true})); }}
                  />
                  <span>Female</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sex"
                    value="O"
                    checked={form.sex === 'O'}
                    onChange={(e)=>{ setField('sex', e.target.value); setTouched(prev=>({...prev, sex:true})); }}
                  />
                  <span>Other / Prefer not to say</span>
                </label>
              </div>
              {touched.sex && errors.sex && <div className="text-red-600 text-sm">{errors.sex}</div>}
            </div>
            <div className="grid gap-1">
              <Label>Height (inches)</Label>
              <Input id="intake-height_in" type="number" inputMode="numeric" value={form.height_in} onChange={e=>{ setField("height_in", e.target.value); setTouched(p=>({...p,height_in:true})); }} onInput={e=>{ setField("height_in", e.target.value); }} onBlur={()=>onBlurField('height_in')} placeholder="e.g., 70"/>
              {touched.height_in && errors.height_in && <div className="text-red-600 text-sm">{errors.height_in}</div>}
            </div>
            <div className="grid gap-1">
              <Label>Weight (lb)</Label>
              <Input id="intake-weight_lb" type="number" inputMode="numeric" value={form.weight_lb} onChange={e=>{ setField("weight_lb", e.target.value); setTouched(p=>({...p,weight_lb:true})); }} onInput={e=>{ setField("weight_lb", e.target.value); }} onBlur={()=>onBlurField('weight_lb')} placeholder="e.g., 190"/>
              {touched.weight_lb && errors.weight_lb && <div className="text-red-600 text-sm">{errors.weight_lb}</div>}
            </div>
          <div className="grid gap-1">
            <Label>ZIP / Location</Label>
            <Input id="intake-zip" autoComplete="postal-code" value={form.zip || ""} onChange={e=>{ setField("zip", e.target.value); setTouched(p=>({...p,zip:true})); }} onInput={e=>{ setField("zip", e.target.value); }} onBlur={()=>onBlurField('zip')} placeholder="optional"/>
            {touched.zip && errors.zip && <div className="text-red-600 text-sm">{errors.zip}</div>}
          </div>
            <div className="grid gap-1">
              <Label>Meals per day</Label>
              <Select value={form.meals_per_day || ""} onValueChange={v=> setField('meals_per_day', v)}>
                <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>
                  {[...Array(8)].map((_,i)=>(<SelectItem key={i+1} value={String(i+1)}>{i+1}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Optional: 1–8 meals/day. Planner will honor this.</p>
            </div>
            <div className="grid gap-1">
              <Label>Workout days per week</Label>
              <Select value={form.workout_days_per_week || ""} onValueChange={v=> setField('workout_days_per_week', v)}>
                <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>
                  {[...Array(7)].map((_,i)=>(<SelectItem key={i+1} value={String(i+1)}>{i+1}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Session length (minutes)</Label>
              <Select value={form.workout_session_min || ""} onValueChange={v=> setField('workout_session_min', v)}>
                <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>
                  {[15,30,45,60,75,90,105,120].map(v=>(<SelectItem key={v} value={String(v)}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Preferred workout time</Label>
              <Select value={form.workout_time || ""} onValueChange={v=> setField('workout_time', v)}>
                <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>
                  {Array.from({length:17},(_,i)=> i+5).map(h=>{
                    const s = String(h).padStart(2,'0')+':00';
                    return <SelectItem key={s} value={s}>{s}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Gym</Label>
              <Input id="intake-gym" value={form.gym || ""} onChange={e=>{ setField("gym", e.target.value); setTouched(p=>({...p,gym:true})); }} onInput={e=>{ setField("gym", e.target.value); }} onBlur={()=>onBlurField('gym')} placeholder="e.g., Crunch, Planet Fitness, Home"/>
              {touched.gym && errors.gym && <div className="text-red-600 text-sm">{errors.gym}</div>}
            </div>
            <div className="grid gap-1">
              <Label>Diabetic</Label>
              <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="diabetic" value="yes" checked={!!form.diabetic===true}
                         onChange={()=>{ setField('diabetic', true); setTouched(prev=>({...prev, diabetic:true})); }} />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="diabetic" value="no" checked={!!form.diabetic===false}
                         onChange={()=>{ setField('diabetic', false); setTouched(prev=>({...prev, diabetic:true})); }} />
                  <span>No</span>
                </label>
              </div>
              {touched.diabetic && errors.diabetic && <div className="text-red-600 text-sm">{errors.diabetic}</div>}
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Health Conditions & Meds</Label>
            <Textarea id="intake-conditions" rows={3} value={form.conditions} onChange={e=>{ setField("conditions", e.target.value); setTouched(p=>({...p,conditions:true})); }} onInput={e=>{ setField("conditions", e.target.value); }} onBlur={()=>onBlurField('conditions')} placeholder="e.g., hypertension, shoulder pain, meds list…"/>
            {touched.conditions && errors.conditions && <div className="text-red-600 text-sm">{errors.conditions}</div>}
          </div>
          <div className="grid gap-1">
            <Label>Goals</Label>
            <Textarea id="intake-goals" rows={3} value={form.goals} onChange={e=>{ setField("goals", e.target.value); setTouched(p=>({...p,goals:true})); }} onInput={e=>{ setField("goals", e.target.value); }} onBlur={()=>onBlurField('goals')} placeholder="e.g., Lose 15 lb in 8 weeks; feel more energetic; improve A1C"/>
            {touched.goals && errors.goals && <div className="text-red-600 text-sm">{errors.goals}</div>}
            <p className="text-sm text-muted-foreground mt-1">Tip: Include timelines (e.g., “in 8 weeks”) so we can tailor pace and warnings.</p>
          </div>

          <div className="grid gap-1">
            <Label>Notes about food choices (free‑form)</Label>
          <Textarea id="intake-food_notes" rows={5} value={form.food_notes} onChange={e=>{ setField("food_notes", e.target.value); setTouched(p=>({...p,food_notes:true})); }} onInput={e=>{ setField("food_notes", e.target.value); }} onBlur={()=>onBlurField('food_notes')}
               placeholder={"Examples:\n• Prefer 15–20 min meals; dislike cilantro; limit dairy\n• Usually 3 meals/day; ok with salmon & chicken; avoid pork\n• Like Mediterranean flavors; pantry staples only Mon–Thu"} />
            {touched.food_notes && errors.food_notes && <div className="text-red-600 text-sm">{errors.food_notes}</div>}
            <p className="text-sm text-muted-foreground mt-1">
              Describe preferences, dislikes, time available, and meals/day. The app will interpret this to guide your plan.
            </p>
          </div>

          <div className="grid gap-1">
            <Label>Workout preferences & constraints (free‑form)</Label>
            <Textarea id="intake-workout_notes" rows={5} value={form.workout_notes} onChange={e=>{ setField("workout_notes", e.target.value); setTouched(p=>({...p,workout_notes:true})); }} onInput={e=>{ setField("workout_notes", e.target.value); }} onBlur={()=>onBlurField('workout_notes')}
              placeholder={"Examples:\n• Home only; adjustable dumbbells to 50 lb, bands\n• Prefer yoga & calisthenics; injured shoulder—avoid overhead pressing\n• Gym: Planet Fitness (Smith machine ok); 4x/week 30–45 min"} />
            {touched.workout_notes && errors.workout_notes && <div className="text-red-600 text-sm">{errors.workout_notes}</div>}
            <p className="text-sm text-muted-foreground mt-1">
              Include gym/home, equipment, preferred styles, and any injuries or limits.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={onSubmit} disabled={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
