// The editor page's helpers, served by `npm run dev` under /__tk/ (your computer only, never deployed):
//   GET  /__tk/tutorials              your recorded tutorials
//   GET  /__tk/tutorial/<name>        its tutorial file
//   PUT  /__tk/tutorial/<name>        save the tutorial file (and apply it, like npm run titles)
//   POST /__tk/export/<name>          make a video (npm run export), returns a job to follow
//   POST /__tk/docs/<name>            add it to the help site (npm run docs), returns a job
//   POST /__tk/record/<name>          record a new tutorial (npm run record), returns a job
//   POST /__tk/command/<job id>       {"cmd": "start" | "next" | "stop"} for that recording
//   POST /__tk/import/<name>          {"recording": …, "tutorial"?: …} add a recording made elsewhere
//   GET  /__tk/files/<name>           the files that belong to a tutorial (shown before deleting)
//   POST /__tk/delete/<name>          move them all into deleted/<name>-<date>/ (restorable)
//   POST /__tk/restore/<folder>       move a deleted tutorial back
//   GET  /__tk/job/<id>               how a job is going
//   GET  /__tk/video/<file>           an exported video from videos/
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyTutorialFile } from "./apply.mjs";
import { DEFAULT_SETTINGS, isRecording, isTutorialFile, scriptFromRecording } from "./script-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/; // a tutorial or file name — no folders
const at = (...p) => path.join(ROOT, ...p);
const jobs = new Map();
let nextJob = 1;

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};
const readBody = (req, max = 5e6) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (d) => {
      data += d;
      if (data.length > max) reject(new Error("too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("not JSON"));
      }
    });
    req.on("error", reject);
  });

function list() {
  if (!fs.existsSync(at("tutorials"))) return [];
  return fs
    .readdirSync(at("tutorials"))
    .filter((f) => f.endsWith(".tutorial.json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.tutorial\.json$/, ""))
    .filter((n) => fs.existsSync(at("public", "recordings", `${n}.json`)))
    .map((name) => {
      let title = name;
      try {
        title = JSON.parse(fs.readFileSync(at("tutorials", `${name}.tutorial.json`), "utf8")).title || name;
      } catch {}
      return { name, title };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Every file that belongs to a tutorial (paths relative to the project). */
function filesOf(name) {
  const out = [`tutorials/${name}.tutorial.json`, `public/recordings/${name}.json`];
  for (const ext of ["webm", "mp4"]) out.push(`videos/${name}.${ext}`, `help-site/static/videos/${name}.${ext}`);
  out.push(`help-site/static/recordings/${name}.json`);
  const docs = at("help-site", "docs");
  if (fs.existsSync(docs))
    for (const d of fs.readdirSync(docs, { withFileTypes: true })) if (d.isDirectory()) out.push(`help-site/docs/${d.name}/${name}.mdx`);
  return out.filter((f) => fs.existsSync(at(f)));
}
const moveFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to); // across drives
    fs.rmSync(from);
  }
};
// The help site's home page lists the guides: refresh it after a page goes or comes back.
const rebuildGuideList = () => {
  try {
    execFileSync(process.execPath, [at("scripts", "docs.mjs"), "--rebuild-list"], { cwd: ROOT, stdio: "ignore" });
  } catch {}
};

/** Run one of our scripts in the background and keep its output for /__tk/job/<id>. */
function startJob(kind, args) {
  const id = String(nextJob++);
  const job = { id, kind, running: true, ok: false, percent: 0, log: "", phase: "starting", step: 1, actions: 0 };
  jobs.set(id, job);
  const p = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  job.proc = p;
  const take = (d) => {
    const text = String(d);
    job.log = (job.log + text).slice(-20000);
    const pct = [...text.matchAll(/(\d+)%/g)].at(-1);
    if (pct) job.percent = Number(pct[1]);
    // Recording: follow along (waiting for start → recording, step N, actions so far → saving).
    if (/Log in if you need to/.test(text)) job.phase = "ready";
    if (/Recording started|Recording restarted/.test(text)) Object.assign(job, { phase: "recording", step: 1, actions: 0 });
    const step = [...text.matchAll(/— Step (\d+) —/g)].at(-1);
    if (step) job.step = Number(step[1]);
    job.actions += (text.match(/^ {2}recorded /gm) ?? []).length;
    if (/Saving…/.test(text)) job.phase = "saving";
  };
  p.stdout.on("data", take);
  p.stderr.on("data", take);
  p.on("close", (code) => {
    job.running = false;
    job.phase = "done";
    job.ok = code === 0;
    if (job.ok) job.percent = 100;
    if (job.done) job.done(job);
  });
  return job;
}

export async function devApi(req, res, next) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/__tk/")) return next();
  const [, , what, raw] = url.pathname.split("/");
  const name = raw ? decodeURIComponent(raw) : "";
  if (raw && !NAME.test(name)) return send(res, 400, { error: "Bad name" });
  try {
    if (what === "tutorials" && req.method === "GET") return send(res, 200, list());

    if (what === "tutorial") {
      const file = at("tutorials", `${name}.tutorial.json`);
      if (!fs.existsSync(file)) return send(res, 404, { error: `No tutorials/${name}.tutorial.json` });
      if (req.method === "GET") return send(res, 200, { script: JSON.parse(fs.readFileSync(file, "utf8")), defaults: DEFAULT_SETTINGS });
      if (req.method === "PUT") {
        const script = await readBody(req);
        if (!script || typeof script !== "object" || !Array.isArray(script.steps)) return send(res, 400, { error: "That isn't a tutorial file" });
        fs.writeFileSync(file, JSON.stringify(script, null, 2) + "\n");
        const warnings = [];
        applyTutorialFile(name, { log: () => {}, warn: (m) => warnings.push(m) });
        // Already on the help site? Keep its copy in step (as npm run titles does).
        const onSite = at("help-site", "static", "recordings", `${name}.json`);
        if (fs.existsSync(onSite)) fs.copyFileSync(at("public", "recordings", `${name}.json`), onSite);
        return send(res, 200, { ok: true, warnings });
      }
    }

    if (what === "import" && req.method === "POST") {
      // A recording (and maybe its tutorial file) from another computer or a colleague.
      const { recording, tutorial } = await readBody(req, 500e6);
      const recFile = at("public", "recordings", `${name}.json`);
      const scriptFile = at("tutorials", `${name}.tutorial.json`);
      if (recording !== undefined && !isRecording(recording)) return send(res, 400, { error: "That recording file isn't one tutorial-kit made (no steps or events in it)." });
      if (tutorial !== undefined && !isTutorialFile(tutorial)) return send(res, 400, { error: "That tutorial file isn't one tutorial-kit made (no steps in it)." });
      if (!recording && !fs.existsSync(recFile)) return send(res, 400, { error: `Choose the recording too — the big .json file (there's no recording called "${name}" here yet).` });
      if (!recording && !tutorial) return send(res, 400, { error: "Choose a file to import." });
      fs.mkdirSync(path.dirname(recFile), { recursive: true });
      fs.mkdirSync(path.dirname(scriptFile), { recursive: true });
      if (recording) fs.writeFileSync(recFile, JSON.stringify(recording));
      const script = tutorial ?? scriptFromRecording(recording, name);
      fs.writeFileSync(scriptFile, JSON.stringify(script, null, 2) + "\n");
      const warnings = [];
      applyTutorialFile(name, { log: () => {}, warn: (m) => warnings.push(m) });
      return send(res, 200, { ok: true, warnings, madeTutorialFile: !tutorial });
    }

    if (what === "files" && req.method === "GET") return send(res, 200, { files: filesOf(name) });

    if (what === "delete" && req.method === "POST") {
      // Not erased: moved into deleted/<name>-<date>/, keeping their folders, so it can be undone.
      if ([...jobs.values()].some((j) => j.running && j.name === name)) return send(res, 409, { error: "That tutorial is being recorded — stop first." });
      const files = filesOf(name);
      if (!files.length) return send(res, 404, { error: `No tutorial called "${name}"` });
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
      const folder = `${name}-${stamp}`;
      for (const f of files) moveFile(at(f), at("deleted", folder, f));
      fs.writeFileSync(at("deleted", folder, "deleted.json"), JSON.stringify({ name, deleted: d.toISOString(), files }, null, 2) + "\n");
      rebuildGuideList();
      return send(res, 200, { ok: true, folder: `deleted/${folder}`, files });
    }

    if (what === "restore" && req.method === "POST") {
      const dir = at("deleted", name);
      const info = fs.existsSync(path.join(dir, "deleted.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "deleted.json"), "utf8")) : null;
      if (!info) return send(res, 404, { error: "Nothing to restore there." });
      const clash = info.files.filter((f) => fs.existsSync(at(f)));
      if (clash.length) return send(res, 409, { error: `Can't restore: ${clash.join(", ")} exists again (a new tutorial with the same name?).` });
      for (const f of info.files) moveFile(path.join(dir, f), at(f));
      fs.rmSync(dir, { recursive: true, force: true });
      rebuildGuideList();
      return send(res, 200, { ok: true, name: info.name });
    }

    if (what === "export" && req.method === "POST") {
      if ([...jobs.values()].some((j) => j.kind === "export" && j.running)) return send(res, 409, { error: "A video is already being made — wait for it to finish." });
      const o = await readBody(req);
      const mp4 = o.format === "mp4";
      const scale = [2, 1, 0.75, 0.5].includes(Number(o.scale)) ? Number(o.scale) : 1;
      const args = [at("scripts", "export.mjs"), name, ...(mp4 ? ["--mp4"] : []), ...(o.cards === false ? ["--no-cards"] : []), "--scale", String(scale)];
      if (o.zoom === false) args.push("--no-zoom");
      if (o.captions === false) args.push("--no-captions");
      if (o.stepLabel === false) args.push("--no-step-label");
      const job = startJob("export", args);
      job.done = (j) => {
        const file = `${name}.${mp4 ? "mp4" : "webm"}`;
        if (j.ok && fs.existsSync(at("videos", file))) {
          j.file = file;
          j.size = `${(fs.statSync(at("videos", file)).size / 1e6).toFixed(1)} MB`;
        }
      };
      return send(res, 200, { job: job.id });
    }

    if (what === "record" && req.method === "POST") {
      if ([...jobs.values()].some((j) => j.kind === "record" && j.running)) return send(res, 409, { error: "A recording is already open — stop it first." });
      const o = await readBody(req);
      if (!/^https?:\/\/\S+$/.test(o.url ?? "")) return send(res, 400, { error: "Enter the page address, starting with http:// or https://" });
      const args = [at("scripts", "record.mjs"), "--url", o.url, name];
      if (o.size === "full") args.push("--fullscreen");
      else if (/^\d{3,5}x\d{3,5}$/.test(o.size ?? "")) args.push("--size", o.size);
      if (o.maskInputs) args.push("--mask-inputs");
      const job = startJob("record", args);
      job.name = name;
      return send(res, 200, { job: job.id });
    }

    if (what === "command" && req.method === "POST") {
      const j = jobs.get(name);
      const { cmd } = await readBody(req);
      if (!j || j.kind !== "record" || !j.running) return send(res, 404, { error: "That recording isn't open any more." });
      if (!["start", "next", "stop"].includes(cmd)) return send(res, 400, { error: "Unknown command" });
      j.proc.stdin.write(`${cmd}
`);
      return send(res, 200, { ok: true });
    }

    if (what === "docs" && req.method === "POST") return send(res, 200, { job: startJob("docs", [at("scripts", "docs.mjs"), name]).id });

    if (what === "job" && req.method === "GET") {
      const j = jobs.get(name);
      if (!j) return send(res, 404, { error: "No such job" });
      const { done, proc, ...info } = j;
      return send(res, 200, info);
    }

    if (what === "video" && req.method === "GET") {
      const file = at("videos", name);
      if (!/\.(webm|mp4)$/.test(name) || !fs.existsSync(file)) return send(res, 404, { error: "No such video" });
      res.setHeader("Content-Type", name.endsWith(".mp4") ? "video/mp4" : "video/webm");
      res.setHeader("Content-Length", String(fs.statSync(file).size));
      if (url.searchParams.has("download")) res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      return fs.createReadStream(file).pipe(res);
    }
    return send(res, 404, { error: "Unknown request" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
}
