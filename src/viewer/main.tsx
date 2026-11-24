import { createRoot } from "react-dom/client";
import { Tutorial } from "./Tutorial";

const name = new URLSearchParams(location.search).get("t") ?? "ticket-form";

createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 16px", fontFamily: "ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111827" }}>
    <h1 style={{ textAlign: "center", margin: "0 0 32px" }}>How to: {name.replace(/-/g, " ")}</h1>
    <Tutorial src={`/recordings/${name}.json`} />
  </div>,
);
