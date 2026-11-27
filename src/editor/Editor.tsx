// The tutorial editor: npm run dev → http://localhost:5180/edit
// Everything in tutorials/<name>.tutorial.json as a form, with the player showing each change live.
// Save writes the file (same as editing it by hand); Export, Help site and Record run our scripts
// through the dev server (scripts/dev-api.mjs).
import { useEffect, useMemo, useRef, useState } from "react";
import { applyScript, DEFAULT_SETTINGS, isRecording, isTutorialFile } from "../../scripts/script-core.mjs";
import { Tutorial } from "../viewer/Tutorial";
import { stepLength, tutorialAt } from "../viewer/time";
import type { Recording } from "../viewer/types";
import "./Editor.css";

type Action = { caption?: string; zoom?: boolean; speed?: number; deleted?: boolean; action?: string; [k: string]: unknown };
type Step = { title?: string; description?: string; zoom?: boolean; speed?: number; deleted?: boolean; actions?: Action[]; [k: string]: unknown };
type Settings = { zoom?: number | boolean; captions?: boolean; colors?: Record<string, string> };
type Script = { title?: string; description?: string; category?: string; order?: number; url?: string; settings?: Settings; steps: Step[]; [k: string]: unknown };
type Job = { id: string; running: boolean; ok: boolean; percent: number; log: string; phase?: string; step?: number; actions?: number; file?: string; size?: string };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const COLORS: [string, string][] = [
  ["accent", "Accent (step cards)"],
  ["click", "Click ripple"],
  ["cursor", "Cursor"],
  ["captionBg", "Caption background"],
  ["captionText", "Caption text"],
];
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

async function api<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/__tk/${path}`, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? (r.status === 404 ? "The editor needs npm run dev." : `Error ${r.status}`));
  return data as T;
}

/** Follow a background job until it ends. */
function useJob(onEnd?: (j: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    if (!job?.running) return;
    const t = setTimeout(async () => {
      try {
        const j = await api<Job>(`job/${job.id}`);
        setJob(j);
        if (!j.running) end.current?.(j);
      } catch {
        setJob((x) => (x ? { ...x, running: false } : x));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [job]);
  return [job, setJob] as const;
}

/** Make the file complete for the form: settings in one place, every step and action present. */
function normalize(input: Script, rec: Recording): Script {
  const s: Script = structuredClone(input);
  s.settings = { ...(s.settings ?? {}) };
  for (const k of ["zoom", "captions", "colors"] as const) {
    if (k in s) {
      (s.settings as Record<string, unknown>)[k] = s[k];
      delete s[k];
    }
  }
  s.steps = rec.steps.map((r, i) => {
    const st: Step = { ...(s.steps?.[i] ?? { title: r.title, description: r.description }) };
    const caps = r.captions ?? [];
    st.actions = [
      ...caps.map((c, j) => {
        const a = { ...(st.actions?.[j] ?? {}) };
        if (typeof a.caption !== "string") a.caption = c.text;
        return a;
      }),
      ...(st.actions ?? []).slice(caps.length),
    ];
    return st;
  });
  return s;
}

// Colors: the picker needs #rrggbb; keep any transparency the color had (e.g. the caption background).
const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
function parse(css: string) {
  if (!ctx) return { hex: "#000000", alpha: 1 };
  ctx.fillStyle = "#000000";
  ctx.fillStyle = css;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) return { hex: v, alpha: 1 };
  const m = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return { hex: "#" + m.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join(""), alpha: m[3] ?? 1 };
}
function withAlpha(hex: string, alpha: number) {
  if (alpha >= 1) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const tail = (log: string, n = 6) => log.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).slice(-n).join("\n");

export function Editor() {
  const [list, setList] = useState<{ name: string; title: string }[] | null>(null);
  const [name, setName] = useState(() => new URLSearchParams(location.search).get("t") ?? "");
  const [base, setBase] = useState<Recording | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string; undo?: () => void } | null>(null);
  const nextNotice = useRef<typeof notice>(null); // shown once the next tutorial has loaded
  const [deleting, setDeleting] = useState<string[] | null>(null); // files to confirm, when asking
  const [saving, setSaving] = useState(false);
  const [goto, setGoto] = useState<{ step: number; at: number; n: number }>();
  const [recordOpen, setRecordOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const dirty = script !== null && JSON.stringify(script) !== saved;

  const refreshList = () =>
    api<{ name: string; title: string }[]>("tutorials")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refreshList();
  }, []);
  useEffect(() => {
    if (list && !list.length) setRecordOpen(true);
    if (list?.length && !name) setName(list[0].name);
  }, [list, name]);

  // Load a tutorial: its file, and the recording as last saved.
  useEffect(() => {
    if (!name) return;
    let gone = false;
    setError("");
    setNotice(nextNotice.current);
    nextNotice.current = null;
    setDeleting(null);
    Promise.all([
      api<{ script: Script }>(`tutorial/${encodeURIComponent(name)}`),
      fetch(`/recordings/${encodeURIComponent(name)}.json?${Date.now()}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`No recording for ${name}`)))),
    ])
      .then(([{ script: raw }, rec]) => {
        if (gone) return;
        const s = normalize(raw, rec);
        setBase(rec);
        setScript(s);
        setSaved(JSON.stringify(s));
        history.replaceState(null, "", `/edit?t=${encodeURIComponent(name)}`);
      })
      .catch((e) => !gone && setError(e.message));
    return () => {
      gone = true;
    };
  }, [name]);

  // Live preview: the same rules as npm run titles, run in the page (after a short pause in typing).
  const [draft, setDraft] = useState<Script | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDraft(script), 250);
    return () => clearTimeout(t);
  }, [script]);
  const { preview, warnings } = useMemo(() => {
    const w: string[] = [];
    if (!base || !draft) return { preview: null, warnings: w };
    try {
      return { preview: applyScript(base, draft, (m) => w.push(m)), warnings: w };
    } catch (e) {
      return { preview: base, warnings: [String(e)] };
    }
  }, [base, draft]);

  const change = (fn: (s: Script) => void) =>
    setScript((prev) => {
      if (!prev) return prev;
      const n = structuredClone(prev);
      fn(n);
      return n;
    });

  const save = async () => {
    if (!script) return false;
    setSaving(true);
    try {
      const r = await api<{ warnings: string[] }>(`tutorial/${encodeURIComponent(name)}`, "PUT", script);
      setSaved(JSON.stringify(script));
      setNotice({ ok: true, text: r.warnings.length ? `Saved. Notes: ${r.warnings.join(" ")}` : `Saved tutorials/${name}.tutorial.json` });
      refreshList();
      return true;
    } catch (e) {
      setNotice({ ok: false, text: `Couldn't save: ${(e as Error).message}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S / Cmd+S saves; leaving with unsaved changes asks first.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    // Capture phase: the player keeps key presses to itself once you've clicked it.
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const choose = (n: string) => {
    if (n === name) return;
    if (dirty && !confirm("You have unsaved changes. Switch tutorial and lose them?")) return;
    setBase(null);
    setScript(null);
    setName(n);
  };

  // The preview sticks just below the top bar, whatever its height (it wraps on narrow windows).
  const topRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const top = topRef.current;
    const root = rootRef.current;
    if (!top || !root) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--ed-top", `${top.offsetHeight + 12}px`));
    ro.observe(top);
    return () => ro.disconnect();
  }, []);

  // Delete the tutorial: ask first (listing its files), then move them into deleted/ — with Undo.
  const askDelete = async () => {
    try {
      const { files } = await api<{ files: string[] }>(`files/${encodeURIComponent(name)}`);
      setDeleting(files);
      scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    }
  };
  const doDelete = async () => {
    const gone = name;
    try {
      const r = await api<{ folder: string }>(`delete/${encodeURIComponent(gone)}`, "POST", {});
      const undo = async () => {
        try {
          await api(`restore/${encodeURIComponent(r.folder.replace(/^deleted\//, ""))}`, "POST", {});
          nextNotice.current = { ok: true, text: `Restored “${gone}”.` };
          const l = await api<{ name: string; title: string }[]>("tutorials");
          setList(l);
          setBase(null);
          setScript(null);
          setName(gone);
        } catch (e) {
          setNotice({ ok: false, text: `Couldn't restore: ${(e as Error).message}` });
        }
      };
      const left = (await api<{ name: string; title: string }[]>("tutorials")).filter((t) => t.name !== gone);
      const msg = { ok: true, text: `Deleted “${gone}”: its files were moved to ${r.folder}/.`, undo };
      setDeleting(null);
      setSaved("");
      setBase(null);
      setScript(null);
      setList(left);
      if (left.length) {
        nextNotice.current = msg;
        setName(left[0].name);
      } else {
        setName("");
        setNotice(msg);
        history.replaceState(null, "", "/edit");
      }
    } catch (e) {
      setNotice({ ok: false, text: `Couldn't delete: ${(e as Error).message}` });
    }
  };

  const show = (step: number, at: number) => setGoto({ step, at: Math.max(0, Math.round(at)), n: Date.now() });

  return (
    <div className="ed" ref={rootRef}>
      <header className="ed-top" ref={topRef}>
        <strong className="ed-brand">Tutorial editor</strong>
        {list && list.length > 0 && (
          <label className="ed-pick">
            <span className="ed-sr">Tutorial</span>
            <select value={name} onChange={(e) => choose(e.target.value)}>
              {list.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.title} ({t.name})
                </option>
              ))}
            </select>
          </label>
        )}
        {script && <span className={dirty ? "ed-badge ed-dirty" : "ed-badge"}>{dirty ? "Unsaved changes" : "Saved"}</span>}
        <div className="ed-top-actions">
          <button type="button" className={recordOpen ? "ed-btn ed-on" : "ed-btn"} onClick={() => {
              if (!recordOpen) scrollTo({ top: 0, behavior: "smooth" });
              setRecordOpen(!recordOpen);
            }}>
            ● Record new
          </button>
          <button
            type="button"
            className={importOpen ? "ed-btn ed-on" : "ed-btn"}
            onClick={() => {
              if (!importOpen) scrollTo({ top: 0, behavior: "smooth" });
              setImportOpen(!importOpen);
            }}
          >
            ⇪ Import
          </button>
          {name && (
            <a className="ed-btn" href={`/?t=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer">
              Open player
            </a>
          )}
          <button type="button" className="ed-btn" disabled={!dirty} onClick={() => setScript(JSON.parse(saved))}>
            Undo changes
          </button>
          {name && script && (
            <button type="button" className="ed-btn ed-danger" onClick={askDelete}>
              Delete tutorial
            </button>
          )}
          <button type="button" className="ed-btn ed-primary" disabled={!dirty || saving} onClick={save} title="Ctrl+S / ⌘S">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {recordOpen && (
        <RecordPanel
          names={list?.map((t) => t.name) ?? []}
          url={typeof script?.url === "string" ? script.url : ""}
          onClose={() => setRecordOpen(false)}
          onSaved={(n) => {
            refreshList();
            setRecordOpen(false);
            setBase(null);
            setScript(null);
            if (n === name) setName("");
            setTimeout(() => setName(n));
          }}
        />
      )}
      {importOpen && (
        <ImportPanel
          names={list?.map((t) => t.name) ?? []}
          onClose={() => setImportOpen(false)}
          onImported={(n, note) => {
            if (dirty && n !== name && !confirm("You have unsaved changes. Open the imported tutorial and lose them?")) return;
            refreshList();
            setImportOpen(false);
            setBase(null);
            setScript(null);
            if (n === name) setName("");
            setTimeout(() => {
              setName(n);
              setTimeout(() => setNotice({ ok: true, text: note }), 400);
            });
          }}
        />
      )}
      {error && <p className="ed-msg ed-bad">{error}</p>}
      {deleting && (
        <section className="ed-record ed-confirm" aria-label="Delete this tutorial">
          <div className="ed-card-head">
            <h2>Delete “{script?.title || name}”?</h2>
          </div>
          <p className="ed-hint">These files are moved to the project's <code>deleted/</code> folder (not erased — you can undo):</p>
          <ul className="ed-picked">
            {deleting.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
          {dirty && <p className="ed-msg ed-bad">Your unsaved changes to it are lost.</p>}
          <div className="ed-row ed-row-tight">
            <button type="button" className="ed-btn ed-stop" onClick={doDelete}>
              Delete tutorial
            </button>
            <button type="button" className="ed-btn" onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p className={notice.ok ? "ed-msg ed-good" : "ed-msg ed-bad"} role="status">
          {notice.text}
          {notice.undo && (
            <>
              {" "}
              <button type="button" className="ed-btn ed-small" onClick={notice.undo}>
                Undo
              </button>
            </>
          )}
        </p>
      )}

      {script && preview ? (
        <main className="ed-main">
          <aside className="ed-left">
            <div className="ed-sticky">
              <Tutorial recording={preview} goto={goto} layout="stacked" />
              {warnings.length > 0 && <p className="ed-msg ed-bad">{warnings.join(" ")}</p>}
              <ExportPanel name={name} dirty={dirty} save={save} />
            </div>
          </aside>

          <section className="ed-form">
            <Card title="Tutorial" hint="The help site page and the video's title card.">
              <Field label="Title">
                <input value={script.title ?? ""} onChange={(e) => change((s) => void (s.title = e.target.value))} />
              </Field>
              <Field label="Description">
                <textarea rows={2} value={script.description ?? ""} onChange={(e) => change((s) => void (s.description = e.target.value))} />
              </Field>
              <div className="ed-row">
                <Field label="Help site group">
                  <input value={script.category ?? ""} placeholder="Guides" onChange={(e) => change((s) => void (s.category = e.target.value))} />
                </Field>
                <Field label="Position in group">
                  <input
                    type="number"
                    min={1}
                    value={script.order ?? ""}
                    placeholder="auto"
                    onChange={(e) =>
                      change((s) => {
                        if (e.target.value === "") delete s.order;
                        else s.order = Number(e.target.value);
                      })
                    }
                  />
                </Field>
              </div>
            </Card>

            <LookCard script={script} change={change} />

            {script.steps.map((st, i) => {
              const ps = preview.steps[i];
              // The player leaves deleted steps out, so its step number can be lower than ours.
              const inPlayer = script.steps.slice(0, i).filter((x) => !x.deleted).length;
              return (
                <StepCard
                  key={i}
                  i={i}
                  step={st}
                  seconds={ps ? stepLength(ps) / 1000 : 0}
                  zoomOn={script.settings?.zoom !== false}
                  canDelete={script.steps.filter((x) => !x.deleted).length > 1}
                  change={change}
                  onShow={(j) => (j === undefined || !ps?.captions?.[j] ? show(inPlayer, 0) : show(inPlayer, tutorialAt(ps, ps.captions[j].t) + 150))}
                />
              );
            })}
          </section>
        </main>
      ) : (
        !error && list && list.length > 0 && <p className="ed-loading">Loading…</p>
      )}
    </div>
  );
}

function Card({ title, hint, children, extra, className = "" }: { title: string; hint?: string; children?: React.ReactNode; extra?: React.ReactNode; className?: string }) {
  return (
    <section className={`ed-card ${className}`}>
      <div className="ed-card-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {hint && <p className="ed-hint">{hint}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ed-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function LookCard({ script, change }: { script: Script; change: (fn: (s: Script) => void) => void }) {
  const set = script.settings ?? {};
  const zoomOn = set.zoom !== false;
  const level = typeof set.zoom === "number" ? set.zoom : DEFAULT_SETTINGS.zoom;
  const settings = (s: Script) => (s.settings ??= {});
  return (
    <Card title="Look" hint="For the whole tutorial. Steps and actions below can turn zoom on or off, or change speed, at certain points.">
      <div className="ed-row">
        <Field label="Zoom on clicks">
          <div className="ed-seg" role="group" aria-label="Zoom on clicks">
            <button type="button" className={zoomOn ? "on" : ""} onClick={() => change((s) => void (settings(s).zoom = level))}>
              On
            </button>
            <button type="button" className={!zoomOn ? "on" : ""} onClick={() => change((s) => void (settings(s).zoom = false))}>
              Off
            </button>
          </div>
        </Field>
        <Field label={`Zoom level: ${level.toFixed(1)}×`}>
          <input type="range" min={1.2} max={4} step={0.1} value={level} disabled={!zoomOn} onChange={(e) => change((s) => void (settings(s).zoom = Number(e.target.value)))} />
        </Field>
        <Field label="Captions">
          <div className="ed-seg" role="group" aria-label="Captions">
            <button type="button" className={set.captions !== false ? "on" : ""} onClick={() => change((s) => void (settings(s).captions = true))}>
              On
            </button>
            <button type="button" className={set.captions === false ? "on" : ""} onClick={() => change((s) => void (settings(s).captions = false))}>
              Off
            </button>
          </div>
        </Field>
      </div>
      <div className="ed-colors">
        {COLORS.map(([k, label]) => {
          const value = set.colors?.[k] ?? DEFAULT_SETTINGS.colors[k];
          const { hex, alpha } = parse(value);
          const setColor = (v: string) => change((s) => void ((settings(s).colors ??= {})[k] = v));
          return (
            <div className="ed-color" key={k}>
              <span className="ed-color-label">{label}</span>
              <div className="ed-color-row">
                <input type="color" aria-label={label} value={hex} onChange={(e) => setColor(withAlpha(e.target.value, alpha))} />
                <input className="ed-mono" aria-label={`${label} (CSS)`} value={value} onChange={(e) => setColor(e.target.value)} />
                {value !== DEFAULT_SETTINGS.colors[k] && (
                  <button type="button" className="ed-link" onClick={() => setColor(DEFAULT_SETTINGS.colors[k])}>
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ZoomSelect({ value, inherited, onChange, label }: { value?: boolean; inherited: boolean; onChange: (v?: boolean) => void; label: string }) {
  return (
    <select aria-label={label} value={value === undefined ? "" : value ? "on" : "off"} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "on")}>
      <option value="">Zoom: default ({inherited ? "on" : "off"})</option>
      <option value="on">Zoom: on</option>
      <option value="off">Zoom: off</option>
    </select>
  );
}

function SpeedSelect({ value, inherited, onChange, label }: { value?: number; inherited: number; onChange: (v?: number) => void; label: string }) {
  return (
    <select aria-label={label} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}>
      <option value="">Speed: default ({inherited}×)</option>
      {SPEEDS.map((n) => (
        <option key={n} value={n}>
          Speed: {n}×
        </option>
      ))}
    </select>
  );
}

function StepCard({
  i,
  step,
  seconds,
  zoomOn,
  canDelete,
  change,
  onShow,
}: {
  i: number;
  step: Step;
  seconds: number;
  zoomOn: boolean;
  canDelete: boolean;
  change: (fn: (s: Script) => void) => void;
  onShow: (action?: number) => void;
}) {
  const edit = (fn: (st: Step) => void) => change((s) => fn(s.steps[i]));
  const stepZoom = step.zoom ?? zoomOn;
  const stepSpeed = step.speed ?? 1;
  if (step.deleted)
    return (
      <Card
        title={`Step ${i + 1}: ${step.title || "untitled"}`}
        className="ed-deleted"
        extra={
          <button type="button" className="ed-btn ed-small" onClick={() => edit((st) => void delete st.deleted)}>
            Restore step
          </button>
        }
      >
        <p className="ed-hint">Deleted: not in the player, the video or the help site.</p>
      </Card>
    );
  return (
    <Card
      title={`Step ${i + 1}`}
      extra={
        <span className="ed-card-meta">
          {seconds.toFixed(1)} s
          <button type="button" className="ed-btn ed-small" onClick={() => onShow()}>
            ▶ Show
          </button>
          <button
            type="button"
            className="ed-btn ed-small ed-danger"
            disabled={!canDelete}
            title={canDelete ? "Leave this step out (you can restore it)" : "A tutorial needs at least one step"}
            onClick={() => edit((st) => void (st.deleted = true))}
          >
            Delete step
          </button>
        </span>
      }
    >
      <Field label="Title">
        <input aria-label={`Step ${i + 1} title`} value={step.title ?? ""} onChange={(e) => edit((st) => void (st.title = e.target.value))} />
      </Field>
      <Field label="Description">
        <textarea aria-label={`Step ${i + 1} description`} rows={2} value={step.description ?? ""} onChange={(e) => edit((st) => void (st.description = e.target.value))} />
      </Field>
      <div className="ed-row ed-row-tight">
        <ZoomSelect label={`Step ${i + 1} zoom`} value={step.zoom} inherited={zoomOn} onChange={(v) => edit((st) => (v === undefined ? delete st.zoom : (st.zoom = v)))} />
        <SpeedSelect label={`Step ${i + 1} speed`} value={step.speed} inherited={1} onChange={(v) => edit((st) => (v === undefined ? delete st.speed : (st.speed = v)))} />
      </div>
      <h3 className="ed-sub">Actions</h3>
      <ol className="ed-actions">
        {(step.actions ?? []).map((a, j) => {
          // An action's speed lasts until the next action — so the default is the previous one's.
          let inheritedSpeed = stepSpeed;
          for (let k = 0; k < j; k++) if (step.actions?.[k]?.speed !== undefined) inheritedSpeed = step.actions[k].speed!;
          if (a.deleted)
            return (
              <li key={j} className="ed-action ed-action-deleted">
                <span className="ed-num">{j + 1}</span>
                <div className="ed-action-body ed-action-top">
                  {a.action && <span className="ed-tag">{String(a.action)}</span>}
                  <span className="ed-gone">{a.caption || "(no caption)"}</span>
                  <span className="ed-hint ed-inline">cut from the video</span>
                  <button type="button" className="ed-btn ed-small" onClick={() => edit((st) => void delete st.actions![j].deleted)}>
                    Restore
                  </button>
                </div>
              </li>
            );
          return (
            <li key={j} className="ed-action">
              <span className="ed-num">{j + 1}</span>
              <div className="ed-action-body">
                <div className="ed-action-top">
                  {a.action && <span className="ed-tag">{String(a.action)}</span>}
                  <input
                    aria-label={`Step ${i + 1}, action ${j + 1} caption`}
                    value={a.caption ?? ""}
                    placeholder="No caption (hidden)"
                    onChange={(e) => edit((st) => void (st.actions![j].caption = e.target.value))}
                  />
                  <button type="button" className="ed-btn ed-small" title="Show this moment in the player" onClick={() => onShow(j)}>
                    ▶
                  </button>
                  <button
                    type="button"
                    className="ed-btn ed-small ed-danger"
                    aria-label={`Delete step ${i + 1}, action ${j + 1}`}
                    title="Cut this action out of the video (you can restore it). What it changed on the page stays."
                    onClick={() => edit((st) => void (st.actions![j].deleted = true))}
                  >
                    ✕
                  </button>
                </div>
                <div className="ed-row ed-row-tight">
                  <ZoomSelect label={`Step ${i + 1}, action ${j + 1} zoom`} value={a.zoom} inherited={stepZoom} onChange={(v) => edit((st) => (v === undefined ? delete st.actions![j].zoom : (st.actions![j].zoom = v)))} />
                  <SpeedSelect
                    label={`Step ${i + 1}, action ${j + 1} speed`}
                    value={a.speed}
                    inherited={inheritedSpeed}
                    onChange={(v) => edit((st) => (v === undefined ? delete st.actions![j].speed : (st.actions![j].speed = v)))}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ExportPanel({ name, dirty, save }: { name: string; dirty: boolean; save: () => Promise<boolean> }) {
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [cards, setCards] = useState(true);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [stepLabel, setStepLabel] = useState(true);
  const [err, setErr] = useState("");
  const [job, setJob] = useJob();
  const [docs, setDocs] = useJob();
  const [dsrs, setDsrs] = useState<{ folder: string; page: string; video: boolean; guides: number } | null>(null);
  const busy = !!job?.running;

  const run = async () => {
    setErr("");
    if (dirty && !(await save())) return;
    try {
      const { job: id } = await api<{ job: string }>(`export/${encodeURIComponent(name)}`, "POST", { format, cards, scale, zoom, captions, stepLabel });
      setJob({ id, running: true, ok: false, percent: 0, log: "" });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const addToSite = async () => {
    setErr("");
    if (dirty && !(await save())) return;
    try {
      const { job: id } = await api<{ job: string }>(`docs/${encodeURIComponent(name)}`, "POST", {});
      setDocs({ id, running: true, ok: false, percent: 0, log: "" });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // A folder to copy into your own Docusaurus site.
  const forDocusaurus = async () => {
    setErr("");
    setDsrs(null);
    if (dirty && !(await save())) return;
    try {
      setDsrs(await api(`docusaurus/${encodeURIComponent(name)}`, "POST", {}));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section className="ed-card ed-export">
      <div className="ed-card-head">
        <h2>Video &amp; help site</h2>
      </div>
      <div className="ed-row ed-row-tight">
        <div className="ed-seg" role="group" aria-label="Format">
          <button type="button" className={format === "webm" ? "on" : ""} onClick={() => setFormat("webm")}>
            WebM
          </button>
          <button type="button" className={format === "mp4" ? "on" : ""} onClick={() => setFormat("mp4")}>
            MP4
          </button>
        </div>
        <select aria-label="Size" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
          <option value={2}>Sharp (2×, for Retina screens; slower, bigger)</option>
          <option value={1}>Full size</option>
          <option value={0.75}>75% size</option>
          <option value={0.5}>50% size</option>
        </select>
      </div>
      <div className="ed-checks">
        <label>
          <input type="checkbox" checked={cards} onChange={(e) => setCards(e.target.checked)} /> Title cards
        </label>
        <label>
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} /> Zoom
        </label>
        <label>
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions
        </label>
        <label title="“Step 2 of 3 · title” in the top-left corner while each step plays">
          <input type="checkbox" checked={stepLabel} onChange={(e) => setStepLabel(e.target.checked)} /> Step label
        </label>
      </div>
      <div className="ed-row ed-row-tight">
        <button type="button" className="ed-btn ed-primary" disabled={busy} onClick={run}>
          {busy ? `Making video… ${job?.percent ?? 0}%` : "Export video"}
        </button>
        <button type="button" className="ed-btn" disabled={!!docs?.running} onClick={addToSite}>
          {docs?.running ? "Adding…" : "Add to help site"}
        </button>
        <button type="button" className="ed-btn" title="Make a folder to copy into your own Docusaurus site" onClick={forDocusaurus}>
          Export for Docusaurus
        </button>
      </div>
      {busy && (
        <>
          <div className="ed-progress" role="progressbar" aria-valuenow={job?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${job?.percent ?? 0}%` }} />
          </div>
          <p className="ed-hint">{job?.percent ? "" : "The first video takes longer: it downloads a renderer once."}</p>
        </>
      )}
      {job && !job.running && job.ok && job.file && (
        <div className="ed-done">
          <video src={`/__tk/video/${job.file}?${job.id}`} controls playsInline preload="metadata" />
          <p>
            Saved <code>videos/{job.file}</code> ({job.size}) —{" "}
            <a href={`/__tk/video/${job.file}?download`} download>
              download
            </a>
          </p>
        </div>
      )}
      {job && !job.running && !job.ok && <pre className="ed-log ed-bad">{tail(job.log) || "The export failed."}</pre>}
      {docs && !docs.running && (
        <pre className={docs.ok ? "ed-log" : "ed-log ed-bad"}>{docs.ok ? `${tail(docs.log, 4)}\nPreview the site: npm run help` : tail(docs.log)}</pre>
      )}
      {dsrs && (
        <div className="ed-msg ed-good" role="status">
          <p>
            Added to <code>{dsrs.folder}</code> ({dsrs.guides} guide{dsrs.guides === 1 ? "" : "s"} in it). Copy that folder's contents into the
            root of your Docusaurus site — <code>HOW-TO-ADD.md</code> in it has the one-time setup.
          </p>
          {!dsrs.video && <p>No video included: Export video first if you want a download link on the page.</p>}
        </div>
      )}
      {err && <p className="ed-msg ed-bad">{err}</p>}
    </section>
  );
}

type Picked = { file: string; kind: "recording" | "tutorial"; data: Record<string, unknown>; info: string };

function ImportPanel({ names, onClose, onImported }: { names: string[]; onClose: () => void; onImported: (name: string, note: string) => void }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState<"recording" | "tutorial" | null>(null);
  const recording = picked.find((p) => p.kind === "recording");
  const tutorial = picked.find((p) => p.kind === "tutorial");
  const nameOk = NAME.test(name);
  const exists = names.includes(name);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...picked];
    const bad: string[] = [];
    for (const f of [...files]) {
      try {
        const data = JSON.parse(await f.text());
        const kind = isRecording(data) ? "recording" : isTutorialFile(data) ? "tutorial" : null;
        if (!kind) {
          bad.push(`${f.name}: not a tutorial-kit recording or tutorial file`);
          continue;
        }
        const steps = (data.steps as unknown[]).length;
        const vp = data.viewport as { width: number; height: number } | undefined;
        const info =
          kind === "recording"
            ? `Recording: ${steps} step${steps === 1 ? "" : "s"}, ${vp?.width}×${vp?.height}, ${f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${(f.size / 1e6).toFixed(1)} MB`}`
            : `Tutorial file: “${String(data.title ?? "untitled")}”, ${steps} step${steps === 1 ? "" : "s"}`;
        const i = next.findIndex((p) => p.kind === kind);
        if (i >= 0) next.splice(i, 1);
        next.push({ file: f.name, kind, data, info });
      } catch {
        bad.push(`${f.name}: isn't valid JSON`);
      }
    }
    setPicked(next);
    setProblems(bad);
    // Name from the file: create-ticket.json / create-ticket.tutorial.json → create-ticket
    if (!name && next.length) setName(next[0].file.replace(/(\.tutorial)?\.json$/i, "").replace(/[^A-Za-z0-9_.-]+/g, "-"));
  };

  const go = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ warnings: string[]; madeTutorialFile: boolean }>(`import/${encodeURIComponent(name)}`, "POST", {
        ...(recording ? { recording: recording.data } : {}),
        ...(tutorial ? { tutorial: tutorial.data } : {}),
      });
      const note = `Imported “${name}”.${r.madeTutorialFile ? " Its tutorial file was made from the recording: edit it here and Save." : ""}${r.warnings.length ? ` Notes: ${r.warnings.join(" ")}` : ""}`;
      onImported(name, note);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ed-record" aria-label="Import a tutorial">
      <div className="ed-card-head">
        <h2>Import a tutorial</h2>
        <button type="button" className="ed-link" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="ed-hint">
        From another computer or a colleague. The two files can be in different folders: choose each one in its own box.
      </p>
      <div className="ed-slots">
        {(
          [
            ["recording", "Recording", "<name>.json — the big file, from public/recordings/", "Choose the recording"],
            ["tutorial", "Tutorial file (optional)", "<name>.tutorial.json, from tutorials/ — without it, one is made from the recording", "Choose the tutorial file"],
          ] as const
        ).map(([kind, title, where, label]) => {
          const got = kind === "recording" ? recording : tutorial;
          return (
            <div key={kind} className="ed-slot">
              <span className="ed-slot-title">{title}</span>
              <label
                className={`ed-drop${over === kind ? " ed-over" : ""}${got ? " ed-got" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(kind);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  take(e.dataTransfer.files);
                }}
              >
                <input type="file" accept=".json,application/json" aria-label={label} onChange={(e) => {
                  take(e.target.files);
                  e.target.value = ""; // choosing the same file again still counts
                }} />
                {got ? (
                  <span>
                    ✓ <strong>{got.file}</strong>
                    <br />
                    <small>{got.info}</small>
                  </span>
                ) : (
                  <span>
                    Drop it here, or click to choose
                    <br />
                    <small>{where}</small>
                  </span>
                )}
              </label>
              {got && (
                <button type="button" className="ed-link" onClick={() => setPicked(picked.filter((x) => x !== got))}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      {problems.map((p) => (
        <p key={p} className="ed-msg ed-bad">
          {p}
        </p>
      ))}
      {picked.length > 0 && (
        <>
          <div className="ed-row">
            <Field label="Tutorial name">
              <input value={name} onChange={(e) => setName(e.target.value.trim())} />
            </Field>
          </div>
          {name && !nameOk && <p className="ed-msg ed-bad">Use letters, numbers, - and _ in the name (no spaces).</p>}
          {!recording && nameOk && !exists && <p className="ed-msg ed-bad">Choose the recording too: there's no tutorial called “{name}” here yet.</p>}
          {nameOk && exists && (
            <p className="ed-msg">
              “{name}” exists. Importing replaces {recording ? (tutorial ? "its recording and tutorial file" : "its recording, and makes a new tutorial file") : "its tutorial file"}.
            </p>
          )}
          <button type="button" className="ed-btn ed-primary" disabled={busy || !nameOk || (!recording && !exists)} onClick={go}>
            {busy ? "Importing…" : exists ? "Import and replace" : "Import"}
          </button>
        </>
      )}
      {err && <p className="ed-msg ed-bad">{err}</p>}
    </section>
  );
}

function RecordPanel({ names, url: initialUrl, onClose, onSaved }: { names: string[]; url: string; onClose: () => void; onSaved: (name: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [mask, setMask] = useState(false);
  const [err, setErr] = useState("");
  const [job, setJob] = useJob((j) => j.ok && onSaved(name));
  const live = !!job?.running;
  const nameOk = NAME.test(name);

  const open = async () => {
    setErr("");
    try {
      const { job: id } = await api<{ job: string }>(`record/${encodeURIComponent(name)}`, "POST", { url, size, maskInputs: mask });
      setJob({ id, running: true, ok: false, percent: 0, log: "", phase: "starting" });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const send = (cmd: "start" | "next" | "stop") => job && api(`command/${job.id}`, "POST", { cmd }).catch((e) => setErr(e.message));

  return (
    <section className="ed-record" aria-label="Record a new tutorial">
      <div className="ed-card-head">
        <h2>Record a tutorial</h2>
        {!live && (
          <button type="button" className="ed-link" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {!live ? (
        <>
          <div className="ed-row">
            <Field label="Page address">
              <input value={url} placeholder="https://your-app/screen" onChange={(e) => setUrl(e.target.value.trim())} />
            </Field>
            <Field label="Tutorial name">
              <input value={name} placeholder="create-ticket" onChange={(e) => setName(e.target.value.trim())} />
            </Field>
            <Field label="Window">
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="">1280×720 (default)</option>
                <option value="full">Full screen</option>
                <option value="1600x900">1600×900</option>
                <option value="1920x1080">1920×1080</option>
              </select>
            </Field>
          </div>
          <label className="ed-checks">
            <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Hide everything typed into fields
          </label>
          {name && !nameOk && <p className="ed-msg ed-bad">Use letters, numbers, - and _ in the name (no spaces).</p>}
          {nameOk && names.includes(name) && <p className="ed-msg">“{name}” exists — recording again replaces its steps; its title, description and look are kept.</p>}
          <button type="button" className="ed-btn ed-primary" disabled={!nameOk || !/^https?:\/\/\S+$/.test(url)} onClick={open}>
            Open Chrome
          </button>
          {job && !job.running && !job.ok && <pre className="ed-log ed-bad">{tail(job.log) || "Recording failed."}</pre>}
        </>
      ) : (
        <div className="ed-rec-live">
          <p className="ed-rec-status">
            {job.phase === "starting" && "Opening Chrome…"}
            {job.phase === "ready" && "In the Chrome window: log in if needed and go to the screen where the tutorial starts. Then press Start."}
            {job.phase === "recording" && (
              <>
                <span className="ed-dot" aria-hidden="true" /> Recording — step {job.step}, {job.actions} action{job.actions === 1 ? "" : "s"}. Click through the page in Chrome.
              </>
            )}
            {job.phase === "saving" && "Saving…"}
          </p>
          <div className="ed-row ed-row-tight">
            {job.phase === "ready" && (
              <button type="button" className="ed-btn ed-primary" onClick={() => send("start")}>
                ● Start recording
              </button>
            )}
            {job.phase === "recording" && (
              <>
                <button type="button" className="ed-btn ed-primary" onClick={() => send("next")} title="The next things you do become a new step">
                  Next step
                </button>
                <button type="button" className="ed-btn" onClick={() => send("start")} title="Throw away what's recorded and start again from the page as it is now">
                  Start over
                </button>
                <button type="button" className="ed-btn ed-stop" onClick={() => send("stop")}>
                  ■ Stop &amp; save
                </button>
              </>
            )}
            {job.phase === "ready" && (
              <button type="button" className="ed-btn" onClick={() => send("stop")}>
                Cancel
              </button>
            )}
          </div>
          <p className="ed-hint">Alt+R / Alt+N (Mac: Option) in the Chrome window work too. Closing that window also stops and saves.</p>
        </div>
      )}
    </section>
  );
}
