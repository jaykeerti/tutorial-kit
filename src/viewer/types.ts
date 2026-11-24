import type { eventWithTime } from "rrweb";

export type Recording = {
  viewport: { width: number; height: number };
  events: eventWithTime[];
  cursor: { t: number; x: number; y: number }[];
  clicks: number[];
  steps: { title: string; description: string; start: number; end: number }[];
};
