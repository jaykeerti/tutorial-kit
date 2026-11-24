// Test fixture covering the tricky cases from real apps (used by scripts/test-recorder.mjs):
// two "Submit" buttons (page + dialog), a dialog, a required field with MUI's hidden "*",
// a native <select>, a checkbox with a label, a disabled-until-valid button, a loading spinner,
// a POST request, Enter-to-search, and a same-origin image.
import { useState } from "react";

export default function TestBench() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Bolts");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [pageSubmits, setPageSubmits] = useState(0);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/parts", { method: "POST", body: JSON.stringify({ name, category, urgent }) }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1200)); // slow server
    setStatus(`Saved (${res?.status ?? "network error"})`);
    setRows((r) => [...r, `${name} · ${category}${urgent ? " · urgent" : ""}`]);
    setSaving(false);
    setOpen(false);
  };

  const box: React.CSSProperties = { fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 720 };
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/tk-test.svg" alt="logo" width={32} height={32} />
        <h1 style={{ margin: 0 }}>Parts</h1>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <button onClick={() => setOpen(true)}>Add part</button>
        <button onClick={() => setPageSubmits((n) => n + 1)}>Submit</button>
      </div>

      <label htmlFor="search">Search</label>{" "}
      <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSearched(query)} />
      {searched && <p>{`Searched: ${searched}`}</p>}

      <ul>{rows.map((r) => <li key={r}>{r}</li>)}</ul>
      {status && <p>{status}</p>}
      <p>{`Page submits: ${pageSubmits}`}</p>
      <p data-private>Owner email: jane.doe@example.com</p>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center" }}>
          <div role="dialog" aria-modal="true" style={{ background: "#fff", padding: 24, borderRadius: 12, width: 380 }}>
            <h2 style={{ marginTop: 0 }}>Add part</h2>
            <label htmlFor="part-name">
              Part name<span aria-hidden="true"> *</span>
            </label>
            <input id="part-name" value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 12 }} />
            <label htmlFor="category">Category</label>{" "}
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Bolts</option>
              <option>Nuts</option>
              <option>Washers</option>
            </select>
            <div style={{ margin: "12px 0" }}>
              <label>
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent
              </label>
            </div>
            {saving && <div role="progressbar" style={{ height: 4, background: "#3b82f6", marginBottom: 8 }} />}
            <button disabled={!name || saving} onClick={save}>Submit</button>
          </div>
        </div>
      )}
    </div>
  );
}
