import type { eventWithTime } from "rrweb";
import type { SettingsInput } from "./settings";

export type Step = {
  title: string;
  description: string;
  start: number; // real timestamps in the recording (ms)
  end: number;
  /** [tutorialMs, realTimestamp] points — quiet gaps are squeezed. Missing = play in real time. */
  timeline?: [number, number][];
  /** One per action, at the real time it happened (until = typing finished). Empty text = no caption.
   *  zoom / speed = this action's own settings from the tutorial file. */
  captions?: { t: number; until?: number; text: string; zoom?: boolean; speed?: number }[];
  /** Zoom on/off for this step's actions, from the tutorial file (an action's own setting wins). */
  zoom?: boolean;
  /** Play this step faster (2 = twice as fast) or slower (0.5), from the tutorial file. An action's own speed wins. */
  speed?: number;
};

export type Recording = {
  viewport: { width: number; height: number };
  events: eventWithTime[];
  /** "filmed" = recorded while you clicked (npm run record); missing = robot replay (npm run capture). */
  mode?: "filmed";
  /** Filmed: where each click happened; the viewer glides a smooth cursor between them. */
  pointer?: { t: number; x: number; y: number }[];
  /** Robot replay: exact cursor keyframes. */
  cursor?: { t: number; x: number; y: number }[];
  clicks: number[];
  steps: Step[];
  /** From the tutorial file (npm run titles): zoom, captions, colors. */
  settings?: SettingsInput;
};
