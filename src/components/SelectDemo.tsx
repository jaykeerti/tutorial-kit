// Test fixture: a custom dropdown that behaves like MUI / Ant Design selects —
// it opens on mousedown and puts a full-screen backdrop under the mouse, so the
// browser reports the click on <body>. Used by scripts/test-recorder.mjs.
import { useState } from "react";
import { createPortal } from "react-dom";

const OPTIONS = ["Development", "Staging", "Production"];

export default function SelectDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("Development");
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 48, maxWidth: 420 }}>
      <h1 style={{ marginTop: 0 }}>Deploy settings</h1>
      {/* Like MUI: required asterisk hidden from screen readers, and aria-labelledby pointing at
          both the label and the select itself (so its accessible name includes the current value). */}
      <div id="env-label" style={{ fontWeight: 600, marginBottom: 6 }}>
        Environment<span aria-hidden="true"> *</span>
      </div>
      <div
        id="env-select"
        role="combobox"
        aria-labelledby="env-label env-select"
        aria-expanded={open}
        tabIndex={0}
        onMouseDown={() => setOpen(true)}
        style={{ border: "1px solid #94a3b8", borderRadius: 8, padding: "10px 12px", cursor: "pointer", background: "#fff" }}
      >
        {value} ▾
      </div>
      <button style={{ marginTop: 20, padding: "10px 18px" }} onClick={() => setSaved(true)}>
        Save
      </button>
      {saved && <p>Saved: {value}</p>}

      {open &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "transparent" }} />
            <ul
              role="listbox"
              style={{ position: "fixed", left: 48, top: 160, width: 420, listStyle: "none", margin: 0, padding: 4, background: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.2)", borderRadius: 8 }}
            >
              {OPTIONS.map((o) => (
                <li
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  onClick={() => {
                    setValue(o);
                    setOpen(false);
                  }}
                  style={{ padding: "10px 12px", cursor: "pointer" }}
                >
                  {o}
                </li>
              ))}
            </ul>
          </>,
          document.body,
        )}
    </div>
  );
}
