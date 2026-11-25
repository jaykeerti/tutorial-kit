import { createRoot } from "react-dom/client";
import { Tutorial } from "./Tutorial";

const q = new URLSearchParams(location.search);
const name = q.get("t") ?? "ticket-form";
// &step=2 opens the 2nd step; &at=1500 opens it paused 1.5 s in.
const step = Math.max(0, Number(q.get("step") ?? 1) - 1) || 0;
const at = q.has("at") ? Number(q.get("at")) : undefined;

createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 16px", fontFamily: "ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111827" }}>
    <h1 style={{ textAlign: "center", margin: "0 0 32px" }}>How to: {name.replace(/-/g, " ")}</h1>
    <Tutorial src={`/recordings/${name}.json`} step={step} at={at} />
  </div>,
);
