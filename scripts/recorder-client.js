// Runs inside the page during `npm run record`.
// Watches what the user clicks/types and describes each element in a human, stable way,
// then reports it to Node through window.__tk_rec(...).
(() => {
  if (window !== window.top || window.__tk_recorder) return;
  window.__tk_recorder = true;

  const ROLES = "button, a, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], " +
    "[role=option], [role=combobox], [role=checkbox], [role=radio], [role=switch], [role=link], [role=treeitem], summary";

  const clean = (s) => (s || "").trim().replace(/\s+/g, " ");

  const labelOf = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return clean(l.textContent);
    }
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(" ");
      if (clean(text)) return clean(text);
    }
    return el.getAttribute("aria-label") || clean(el.closest("label")?.textContent) || null;
  };

  const roleOf = (el) => {
    const r = el.getAttribute("role");
    if (r) return r;
    if (el.tagName === "A") return "link";
    return "button"; // <button>, <summary>
  };

  const describe = (el) => {
    const tagged = el.closest("[data-testid]");
    if (tagged && tagged !== document.body) return { testId: tagged.dataset.testid };

    if (el.matches("input, textarea, select")) {
      const label = labelOf(el);
      if (label) return { label };
      if (el.placeholder) return { css: `[placeholder="${el.placeholder}"]` };
      if (el.name) return { css: `${el.tagName.toLowerCase()}[name="${el.name}"]` };
    }

    const ctl = el.closest(ROLES);
    if (ctl) {
      const role = roleOf(ctl);
      // Dropdown triggers are best found by their field label ("Environment"), not their current value.
      if (role === "combobox") {
        const label = labelOf(ctl);
        if (label) return { role, name: label };
      }
      const name = clean(ctl.getAttribute("aria-label") || labelOf(ctl) || ctl.textContent);
      if (name) return { role, name, exact: true };
    }

    // Plain elements: only worth recording if they have a short label of their own.
    const text = clean(el.textContent);
    if (text && text.length < 40 && el.children.length <= 2) return { text, exact: true };
    return null; // empty space / background
  };

  // Many custom dropdowns open on mousedown and put an overlay under the mouse, so the browser
  // reports the following click on <body>. Remember where the mouse went down and use that instead.
  let downTarget = null;
  addEventListener("mousedown", (e) => { downTarget = e.target; }, true);

  addEventListener("click", (e) => {
    let el = e.target;
    const isBackground = el === document.body || el === document.documentElement;
    if (isBackground && downTarget && downTarget !== el && downTarget.isConnected !== false) el = downTarget;
    downTarget = null;
    if (el.matches("input, textarea")) return; // typing is recorded separately
    const target = describe(el);
    if (target) window.__tk_rec({ action: "click", target });
  }, true);

  addEventListener("input", (e) => {
    const el = e.target;
    if (el.matches("input, textarea") && el.type !== "password") {
      const target = describe(el);
      if (target) window.__tk_rec({ action: "type", target, text: el.value });
    }
  }, true);

  addEventListener("keydown", (e) => {
    // Use the physical key (e.code): on a Mac, Option+R types "®", so e.key is never "r".
    if (e.altKey && e.code === "KeyN") window.__tk_rec({ action: "newStep" });
    if (e.altKey && e.code === "KeyR") window.__tk_rec({ action: "start" });
  }, true);
})();
