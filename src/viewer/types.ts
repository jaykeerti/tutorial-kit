import type { eventWithTime } from "rrweb";

export type Step = {
  title: string;
  description: string;
  start: number; // real timestamps in the recording (ms)
  end: number;
  /** [tutorialMs, realTimestamp] points — quiet gaps are squeezed. Missing = play in real time. */
  timeline?: [number, number][];
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
};
