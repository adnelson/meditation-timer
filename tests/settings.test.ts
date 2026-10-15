import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from "../src/settings.ts";

test("settings round-trip including muted volume and disabled start bell", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const settings = { ...DEFAULT_SETTINGS, mode: "Interval" as const, timerMinutes: "12:30", addCountIn: true, countInSeconds: "15", timerBellAtStart: false, keepAwake: false, intervalMinutes: "3", startTime: "09:15", stopTime: "23:30", ringAtStart: false, volume: 0 };
  saveSettings(settings, storage);
  assert.ok(values.has(SETTINGS_KEY));
  assert.deepEqual(loadSettings(storage), settings);
});

test("missing or malformed saved settings use defaults", () => {
  for (const value of [null, "{bad", "null", "[]", "42"]) {
    assert.deepEqual(loadSettings({ getItem: () => value }), DEFAULT_SETTINGS);
  }
});

test("invalid fields fall back independently while valid preferences survive", () => {
  const raw = { mode: "Timer", timerMinutes: "-2", addCountIn: "true", countInSeconds: "1.5", timerBellAtStart: "false", keepAwake: "false", intervalMinutes: "Infinity", startTime: "24:01", stopTime: "18:00", ringAtStart: "false", volume: 101 };
  assert.deepEqual(loadSettings({ getItem: () => JSON.stringify(raw) }), {
    ...DEFAULT_SETTINGS, mode: "Timer", stopTime: "18:00",
  });
  assert.deepEqual(loadSettings({ getItem: () => '{}' }), DEFAULT_SETTINGS);
});

test("blocked reads and writes do not break the app", () => {
  assert.deepEqual(loadSettings({ getItem: () => { throw new Error("Blocked"); } }), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS, { setItem: () => { throw new Error("Full"); } }));
});
