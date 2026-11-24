// Look-and-feel options. They can come from the tutorial file ("settings", applied with
// `npm run titles`) and from props on <Tutorial> — props win, then the file, then these defaults.

export type Colors = {
  /** Step cards: active border, number and progress bar. */
  accent: string;
  /** Click ripple. */
  click: string;
  /** Cursor arrow (its outline stays white). */
  cursor: string;
  /** Caption background and text. */
  captionBg: string;
  captionText: string;
};

export type Settings = {
  /** How far to zoom in around clicks, or false for no zoom. */
  zoom: number | false;
  /** Show captions like Click “Save”. */
  captions: boolean;
  colors: Colors;
};

/** What a tutorial file or the props may contain — everything optional. zoom: true = default level. */
export type SettingsInput = {
  zoom?: number | boolean;
  captions?: boolean;
  colors?: Partial<Colors>;
};

export const DEFAULT_SETTINGS: Settings = {
  zoom: 1.8,
  captions: true,
  colors: {
    accent: "#7c3aed",
    click: "#7c3aed",
    cursor: "#111111",
    captionBg: "rgba(17, 17, 27, 0.86)",
    captionText: "#ffffff",
  },
};

/** Combine layers of settings; later layers win. */
export function resolveSettings(...layers: (SettingsInput | undefined)[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, colors: { ...DEFAULT_SETTINGS.colors } };
  for (const l of layers) {
    if (!l) continue;
    if (l.zoom !== undefined) out.zoom = l.zoom === true ? DEFAULT_SETTINGS.zoom : typeof l.zoom === "number" && l.zoom > 1 ? l.zoom : false;
    if (l.captions !== undefined) out.captions = !!l.captions;
    for (const [k, v] of Object.entries(l.colors ?? {})) if (typeof v === "string" && v.trim()) out.colors[k as keyof Colors] = v.trim();
  }
  return out;
}
