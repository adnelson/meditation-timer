import type { Mode } from "./schedule";

export type Settings = {
  mode: Mode;
  timerMinutes: string;
  intervalMinutes: string;
  ringAtStart: boolean;
  startTime: string;
  stopTime: string;
  volume: number;
};

export const SETTINGS_KEY = "meditation-timer.settings.v1";
export const DEFAULT_SETTINGS: Settings = {
  mode: "Bell",
  timerMinutes: "10",
  intervalMinutes: "5",
  ringAtStart: true,
  startTime: "",
  stopTime: "",
  volume: 50,
};

function validMinutes(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Number(value)) &&
    Number(value) > 0 && Number(value) <= 1440;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && (value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export function loadSettings(storage?: Pick<Storage, "getItem">): Settings {
  try {
    const raw: unknown = JSON.parse((storage ?? window.localStorage).getItem(SETTINGS_KEY) ?? "null");
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
    const saved = raw as Record<string, unknown>;
    return {
      mode: saved.mode === "Bell" || saved.mode === "Timer" || saved.mode === "Interval" ? saved.mode : DEFAULT_SETTINGS.mode,
      timerMinutes: validMinutes(saved.timerMinutes) ? saved.timerMinutes : DEFAULT_SETTINGS.timerMinutes,
      intervalMinutes: validMinutes(saved.intervalMinutes) ? saved.intervalMinutes : DEFAULT_SETTINGS.intervalMinutes,
      ringAtStart: typeof saved.ringAtStart === "boolean" ? saved.ringAtStart : DEFAULT_SETTINGS.ringAtStart,
      startTime: validTime(saved.startTime) ? saved.startTime : DEFAULT_SETTINGS.startTime,
      stopTime: validTime(saved.stopTime) ? saved.stopTime : DEFAULT_SETTINGS.stopTime,
      volume: typeof saved.volume === "number" && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100 ? saved.volume : DEFAULT_SETTINGS.volume,
    };
  } catch {
    // Unavailable storage or malformed data should never prevent using the timer.
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? window.localStorage).setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Continue with in-memory settings when storage is blocked or full.
  }
}
