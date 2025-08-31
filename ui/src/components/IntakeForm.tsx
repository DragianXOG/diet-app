import { useEffect, useState } from "react";
import { getIntake, upsertIntake } from "../api/intake";

interface Intake {
  id?: number;
  name?: string;
  age?: number;
  sex?: string;
  height_in?: number;
  weight_lb?: number;
  goals?: string;
}

export default function IntakeForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Intake>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchIntake() {
      try {
        const data = await getIntake(token);
        if (data) setForm(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchIntake();
  }, [token]);

  function updateField<K extends keyof Intake>(key: K, value: Intake[K]) {
    setForm({ ...form, [key]: value });
  }

  async function save() {
    try {
      const res = await upsertIntake(token, form);
      setForm(res);
      setMessage("Saved!");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      console.error(e);
      setMessage("Error saving");
    }
  }

  if (loading) return <div>Loading intake...</div>;

  return (
    <div className="p-4 border rounded-lg bg-slate-800 text-slate-100 max-w-md">
      <h2 className="text-lg font-semibold mb-2">Intake</h2>
      <label className="block mb-2">
        Name
        <input
          className="w-full p-2 text-black"
          value={form.name || ""}
          onChange={(e) => updateField("name", e.target.value)}
        />
      </label>
      <label className="block mb-2">
        Age
        <input
          type="number"
          className="w-full p-2 text-black"
          value={form.age || ""}
          onChange={(e) => updateField("age", Number(e.target.value))}
        />
      </label>
      <label className="block mb-2">
        Sex
        <input
          className="w-full p-2 text-black"
          value={form.sex || ""}
          onChange={(e) => updateField("sex", e.target.value)}
        />
      </label>
      <label className="block mb-2">
        Weight (lb)
        <input
          type="number"
          className="w-full p-2 text-black"
          value={form.weight_lb || ""}
          onChange={(e) => updateField("weight_lb", Number(e.target.value))}
        />
      </label>
      <label className="block mb-2">
        Goals
        <input
          className="w-full p-2 text-black"
          value={form.goals || ""}
          onChange={(e) => updateField("goals", e.target.value)}
        />
      </label>
      <button
        className="mt-2 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
        onClick={save}
      >
        Save
      </button>
      {message && <div className="mt-2 text-sm">{message}</div>}
    </div>
  );
}
