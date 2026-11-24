// Runs inside the page during `npm run record`.
// Watches what the user does and describes each element in several human, stable ways,
// then reports it to Node through window.__tk_rec(...).
(() => {
  if (window !== window.top || window.__tk_recorder) return;
  window.__tk_recorder = true;

  const ROLES =
    "button, a, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemradio], " +
    "[role=menuitemcheckbox], [role=option], [role=combobox], [role=checkbox], [role=radio], [role=switch], [role=treeitem]";
  // Containers that make a target unambiguous ("the Submit button inside the Add part dialog").
  const SCOPES = "[role=dialog], [role=alertdialog], [role=tabpanel], [role=region][aria-label], [role=region][aria-labelledby]";
  const TEXT_INPUT =
    "textarea, [contenteditable=''], [contenteditable=true], input:not([type=checkbox]):not([type=radio]):not([type=button])" +
    ":not([type=submit]):not([type=reset]):not([type=file]):not([type=image]):not([type=range]):not([type=color])";

  const clean = (s) => (s || "").replace(/[​-‍﻿]/g, "").trim().replace(/\s+/g, " ");
  const isVisible = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";

  // Text as a screen reader (and Playwright) sees it: skips aria-hidden parts such as MUI's required "*".
  const visibleText = (root) => {
    if (!root) return "";
    let s = "";
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.textContent;
      else if (n.nodeType === Node.ELEMENT_NODE && n.getAttribute("aria-hidden") !== "true") n.childNodes.forEach(walk);
    };
    walk(root);
    return clean(s);
  };

  const textOfIds = (ids, exclude) =>
    clean(
      (ids || "")
        .split(/\s+/)
        .map((id) => id && document.getElementById(id))
        .filter((n) => n && (!exclude || (n !== exclude && !exclude.contains(n))))
        .map(visibleText)
        .join(" "),
    );

  const labelOf = (el) => {
    if (el.labels?.length) {
      const t = visibleText(el.labels[0]);
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return visibleText(l);
    }
    // MUI Select points aria-labelledby at the label AND itself (its value) — keep only the label part.
    const by = textOfIds(el.getAttribute("aria-labelledby"), el);
    if (by) return by;
    return clean(el.getAttribute("aria-label")) || visibleText(el.closest("label")) || null;
  };

  const roleOf = (el) => el.getAttribute("role") || (el.tagName === "A" ? "link" : el.matches("input[type=checkbox]") ? "checkbox" : el.matches("input[type=radio]") ? "radio" : "button");

  const nameOf = (ctl) => {
    if (roleOf(ctl) === "combobox") {
      const l = labelOf(ctl);
      if (l) return l;
    }
    return clean(ctl.getAttribute("aria-label")) || textOfIds(ctl.getAttribute("aria-labelledby"), ctl) || visibleText(ctl) || labelOf(ctl);
  };

  // Auto-generated ids (React/MUI) change between renders — don't rely on them.
  const stableId = (id) => !!id && !/^(:r|mui-|rc[-_]|react-|radix-|headlessui-)|\d{3,}|:/.test(id);

  const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && parts.length < 7) {
      if (n.dataset?.testid) {
        parts.unshift(`[data-testid="${CSS.escape(n.dataset.testid)}"]`);
        return parts.join(" > ");
      }
      if (stableId(n.id)) {
        parts.unshift(`#${CSS.escape(n.id)}`);
        return parts.join(" > ");
      }
      let sel = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1) sel += `:nth-of-type(${same.indexOf(n) + 1})`;
      parts.unshift(sel);
      n = n.parentElement;
    }
    return "body > " + parts.join(" > ");
  };

  const scopeOf = (el) => {
    const s = el.closest(SCOPES);
    if (!s) return null;
    const role = s.getAttribute("role");
    const name =
      clean(s.getAttribute("aria-label")) ||
      textOfIds(s.getAttribute("aria-labelledby")) ||
      visibleText(s.querySelector("h1, h2, h3, h4, h5, h6, [class*='DialogTitle']"));
    return { el: s, desc: name ? { role, name } : { role } };
  };

  /** All the ways to find `el` again, best first, plus the container it lives in. */
  const describe = (el) => {
    const scope = scopeOf(el);
    const root = scope?.el || document;
    const cands = [];

    const tagged = el.closest("[data-testid]");
    if (tagged && tagged !== document.body) cands.push({ testId: tagged.dataset.testid });

    const isField = el.matches("input, textarea, select, [contenteditable]");
    if (isField) {
      const label = labelOf(el);
      if (label) cands.push({ label });
      if (el.placeholder) cands.push({ placeholder: el.placeholder });
      if (el.name) cands.push({ css: `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]` });
    }

    const ctl = el.closest(ROLES);
    if (ctl && ctl !== document.body) {
      const role = roleOf(ctl);
      const name = nameOf(ctl);
      if (name) {
        const t = { role, name, exact: true };
        // Several visible controls with the same name? Remember which one.
        const same = [...root.querySelectorAll(ROLES)].filter((e) => isVisible(e) && roleOf(e) === role && nameOf(e) === name);
        if (same.length > 1) t.nth = same.indexOf(ctl);
        cands.push(t);
      }
    }

    const anchor = ctl || el;
    if (!isField) {
      const text = visibleText(anchor);
      if (text && text.length < 40 && anchor.children.length <= 3) cands.push({ text, exact: true });
    }

    if (!cands.length && !ctl && !isField) return null; // empty space / a background — nothing to replay
    cands.push({ css: cssPath(anchor) });

    const seen = new Set();
    const uniq = cands.filter((c) => {
      const k = JSON.stringify(c);
      return seen.has(k) ? false : (seen.add(k), true);
    });
    const out = { target: uniq[0] };
    if (uniq.length > 1) out.alts = uniq.slice(1);
    if (scope) out.within = scope.desc;
    return out;
  };

  const send = (msg) => window.__tk_rec({ ...msg, ts: Date.now() });

  // Many custom dropdowns open on mousedown and put an overlay under the mouse, so the browser
  // reports the following click on <body>. Remember where the mouse went down and use that instead.
  let downTarget = null;
  let lastLabelClick = null;
  addEventListener("mousedown", (e) => (downTarget = e.target), true);

  addEventListener(
    "click",
    (e) => {
      let el = e.target;
      const isBackground = el === document.body || el === document.documentElement;
      if (isBackground && downTarget && downTarget !== el && downTarget.isConnected) el = downTarget;
      downTarget = null;

      // Clicking a <label> makes the browser fire a second click on its input — record only one.
      if (lastLabelClick && el === lastLabelClick.control && Date.now() - lastLabelClick.t < 300) return;
      const label = el.closest("label");
      lastLabelClick = label?.control ? { control: label.control, t: Date.now() } : null;

      // Clicks into text boxes are normally just "put the cursor here" (typing is recorded separately) —
      // except autocompletes (MUI Autocomplete etc.), where the click opens the list of options.
      const opensList = el.matches("[role=combobox], [aria-autocomplete], [aria-haspopup=listbox], [aria-haspopup=true]");
      if (!opensList && (el.matches(TEXT_INPUT) || el.closest("[contenteditable=''], [contenteditable=true]"))) return;
      if (el.matches("select, input[type=file]")) return; // recorded on change
      const d = describe(el);
      if (d) send({ action: "click", ...d });
    },
    true,
  );

  addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (el.type === "password") return; // never record passwords
      if (el.matches(TEXT_INPUT)) {
        const d = describe(el);
        if (d) send({ action: "type", ...d, text: el.value });
      } else if (el.isContentEditable) {
        const d = describe(el);
        if (d) send({ action: "type", ...d, text: el.innerText });
      }
    },
    true,
  );

  addEventListener(
    "change",
    (e) => {
      const el = e.target;
      if (el.matches("select")) {
        const d = describe(el);
        if (d) send({ action: "select", ...d, value: clean(el.selectedOptions[0]?.textContent) || el.value });
      } else if (el.matches("input[type=file]")) {
        const d = describe(el);
        if (d) send({ action: "upload", ...d, files: [...el.files].map((f) => f.name) });
      }
    },
    true,
  );

  addEventListener(
    "keydown",
    (e) => {
      // Shortcuts. Use the physical key (e.code): on a Mac, Option+R types "®" and Option+N types "˜".
      if (e.altKey && (e.code === "KeyN" || e.code === "KeyR")) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === "KeyN") send({ action: "newStep" });
        else {
          const dialogOpen = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].some(isVisible);
          send({ action: "start", url: location.href, dialogOpen });
        }
        return;
      }
      // Keys that do something on their own (submit, close, move focus).
      if (["Enter", "Escape", "Tab"].includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const el = document.activeElement;
        const d = el && el !== document.body ? describe(el) : null;
        send({ action: "press", key: e.shiftKey ? `Shift+${e.key}` : e.key, ...(d || {}) });
      }
    },
    true,
  );
})();
