import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiBase, jsonFetch } from "./_base";

export default function Intake() {
  const base = useApiBase(); const nav = useNavigate();
  const token = localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token") || "";
  const [form, setForm] = useState({ name:"", age:"", sex:"", height_in:"", weight_lb:"", diabetic:false, conditions:"", meds:"", goals:"", zip:"", gym:"" });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("");

  function upd(k,v){ setForm(s=>({...s,[k]:v})) }
  async function save(e){ e.preventDefault(); setErr(""); setSaving(true);
    try {
      await jsonFetch(`${base}/intake`, { method:"POST", headers: token? {Authorization:`Bearer ${token}`} : undefined, body: JSON.stringify(form) });
      localStorage.removeItem("diet.app.intakePending");
      nav("/app", { replace:true });
    } catch (ex) { setErr(ex.message || "Save failed"); } finally { setSaving(false); }
  }

  return (
    <div className="min-h-[100dvh] bg-white px-6 py-8">
      <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6 shadow-soft">
        <h2 className="text-3xl font-semibold mb-4" style={{fontFamily:'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'}}>Welcome — Tell us about you</h2>
        <form onSubmit={save} className="grid md:grid-cols-2 gap-4">
          <div><label className="text-sm">Name</label><input className="border rounded-xl px-3 py-2 w-full" value={form.name} onChange={e=>upd("name",e.target.value)} /></div>
          <div><label className="text-sm">Age</label><input className="border rounded-xl px-3 py-2 w-full" type="number" value={form.age} onChange={e=>upd("age",e.target.value)} /></div>
          <div><label className="text-sm">Sex</label><input className="border rounded-xl px-3 py-2 w-full" value={form.sex} onChange={e=>upd("sex",e.target.value)} /></div>
          <div><label className="text-sm">Height (in)</label><input className="border rounded-xl px-3 py-2 w-full" type="number" value={form.height_in} onChange={e=>upd("height_in",e.target.value)} /></div>
          <div><label className="text-sm">Weight (lb)</label><input className="border rounded-xl px-3 py-2 w-full" type="number" value={form.weight_lb} onChange={e=>upd("weight_lb",e.target.value)} /></div>
          <div className="md:col-span-2"><label className="text-sm">Other conditions</label><input className="border rounded-xl px-3 py-2 w-full" value={form.conditions} onChange={e=>upd("conditions",e.target.value)} /></div>
          <div className="md:col-span-2"><label className="text-sm">Medications</label><input className="border rounded-xl px-3 py-2 w-full" value={form.meds} onChange={e=>upd("meds",e.target.value)} /></div>
          <div className="md:col-span-2"><label className="text-sm">Goals</label><input className="border rounded-xl px-3 py-2 w-full" value={form.goals} onChange={e=>upd("goals",e.target.value)} /></div>
          <div><label className="text-sm">ZIP</label><input className="border rounded-xl px-3 py-2 w-full" value={form.zip} onChange={e=>upd("zip",e.target.value)} /></div>
          <div><label className="text-sm">Gym</label><input className="border rounded-xl px-3 py-2 w-full" value={form.gym} onChange={e=>upd("gym",e.target.value)} /></div>
          {err && <div className="md:col-span-2 text-sm text-red-600">{err}</div>}
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl border bg-[#4B0082] text-white">{saving? "Saving..." : "Save & Continue"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
