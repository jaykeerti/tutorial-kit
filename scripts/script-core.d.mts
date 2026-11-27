// Types for script-core.mjs, so the editor page (TypeScript) can use it.
import type { Recording } from "../src/viewer/types";

export const DEFAULT_SETTINGS: { zoom: number; captions: boolean; colors: Record<string, string> };
export function checkSettings(input: unknown): { settings: Record<string, unknown>; problems: string[] };
export function applyScript(rec: Recording, script: unknown, warn?: (message: string) => void, label?: string): Recording;
export function isRecording(x: unknown): boolean;
export function isTutorialFile(x: unknown): boolean;
export function scriptFromRecording(rec: Recording, name: string): Record<string, unknown>;
