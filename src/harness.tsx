// Mounts any component dropped into src/components/ by name:  /harness.html?c=TicketForm
// (Recording is injected from outside by the capture script, so nothing tutorial-specific lives here.)
//
// If your components need providers (router, store, theme, auth), wrap <Component /> below.
import React from "react";
import { createRoot } from "react-dom/client";

const components = import.meta.glob<{ default: React.ComponentType }>("./components/*.tsx");

(async () => {
  const name = new URLSearchParams(location.search).get("c") ?? "";
  const load = components[`./components/${name}.tsx`];
  const root = createRoot(document.getElementById("root")!);

  if (!load) {
    root.render(
      <p style={{ fontFamily: "sans-serif", padding: 24 }}>
        No component "{name}" in src/components/. Available: {Object.keys(components).join(", ")}
      </p>,
    );
    return;
  }

  const { default: Component } = await load();
  root.render(
    // e.g. <MemoryRouter><QueryClientProvider client={qc}><Component /></QueryClientProvider></MemoryRouter>
    <Component />,
  );
})();
