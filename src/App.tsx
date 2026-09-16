import { useCallback, useEffect, useRef, useState } from "react";

import { advanceSchedule, countdown, createSchedule, minutesToMs } from "./schedule";
import type { Mode, Schedule } from "./schedule";

function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const volumeRef = useRef(50);
  const actionRef = useRef(0);
  const scheduleRef = useRef<Schedule | null>(null);
  const [mode, setMode] = useState<Mode>("Bell");
  const [timerMinutes, setTimerMinutes] = useState("10");
  const [intervalMinutes, setIntervalMinutes] = useState("5");
  const [ringAtStart, setRingAtStart] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [now, setNow] = useState(Date.now);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");
  const [volume, setVolume] = useState(50);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      actionRef.current += 1;
      if (fadeFrameRef.current !== null) {
        cancelAnimationFrame(fadeFrameRef.current);
      }
    };
  }, []);

  const playBell = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
    audio.volume = volumeRef.current / 100;
    audio.currentTime = 0;
    setError("");

    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("The bell could not be played. Check your browser sound permissions and try again.");
    }
  }, []);

  const stopBell = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || fadeFrameRef.current !== null) return;

    setError("");
    if (audio.paused || audio.ended) {
      audio.currentTime = 0;
      return;
    }

    const startVolume = audio.volume;
    const startTime = performance.now();

    function fadeOut(now: number) {
      if (!audio) return;
      const progress = Math.min((now - startTime) / 500, 1);
      audio.volume = startVolume * (1 - progress);

      if (progress < 1) {
        fadeFrameRef.current = requestAnimationFrame(fadeOut);
      } else {
        audio.pause();
        audio.currentTime = 0;
        fadeFrameRef.current = null;
      }
    }

    fadeFrameRef.current = requestAnimationFrame(fadeOut);
  }, []);

  useEffect(() => {
    const tick = () => {
      const current = scheduleRef.current;
      if (!current) return;
      const time = Date.now();
      setNow(time);
      const result = advanceSchedule(current, time);
      scheduleRef.current = result.schedule;
      setSchedule(result.schedule);
      if (result.ring) void playBell();
      if (!result.schedule) {
        if (current.mode === "Interval") stopBell();
        setStatus(current.mode === "Timer" ? "Timer complete." : "Interval session complete.");
      }
    };
    const id = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [playBell, stopBell]);

  function stopSession() {
    // Cancel future bells immediately; let the shared 500 ms fade stop current audio.
    actionRef.current += 1;
    scheduleRef.current = null;
    setSchedule(null);
    setStarting(false);
    setStatus("");
    stopBell();
  }

  async function startSession() {
    if (mode === "Bell") return;
    const action = ++actionRef.current;
    const time = Date.now();
    try {
      const next = createSchedule(mode, mode === "Timer" ? timerMinutes : intervalMinutes, startTime, stopTime, time, ringAtStart);
      const audio = audioRef.current;
      if (!audio) return;
      setError("");
      setStatus("");
      setStarting(true);
      if (fadeFrameRef.current !== null) {
        cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = null;
      }
      // Authorize this media element from the Start click, without ringing early.
      audio.volume = 0;
      audio.currentTime = 0;
      await audio.play();
      if (actionRef.current !== action) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = volumeRef.current / 100;
      scheduleRef.current = next;
      setSchedule(next);
      setNow(Date.now());
    } catch (error) {
      if (actionRef.current !== action) return;
      setError(error instanceof Error ? error.message : "Unable to start the bell. Please try again.");
    } finally {
      if (actionRef.current === action) setStarting(false);
    }
  }

  const active = starting || schedule !== null;
  const waiting = schedule !== null && now < schedule.start;
  const stoppingNext = schedule !== null && schedule.end !== null && schedule.end <= schedule.nextBell;
  let remaining = 0;
  if (schedule) {
    remaining = (waiting ? schedule.start : stoppingNext ? schedule.end! : schedule.nextBell) - now;
  } else if (mode === "Timer" && status !== "Timer complete.") {
    try { remaining = minutesToMs(timerMinutes); } catch { /* Invalid input is explained on Start. */ }
  }
  const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-900 disabled:opacity-50";

  return (
    <main className="grid min-h-svh place-items-center bg-stone-50 px-6 py-12 text-stone-900">
      <section className="w-full max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-700">
          A moment for yourself
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Meditation Timer
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-stone-600">
          Take a breath. Make space for a little stillness.
        </p>
        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/meditation-bell.mp3`}
          preload="auto"
        />
        <fieldset className="mt-8">
          <legend className="sr-only">Mode</legend>
          <div className="flex rounded-full bg-stone-200 p-1">
            {(["Bell", "Timer", "Interval"] as const).map((item) => (
              <label key={item} className="flex-1 cursor-pointer">
                <input
                  type="radio" name="mode" value={item} checked={mode === item}
                  onChange={() => { stopSession(); setMode(item); }}
                  className="peer sr-only"
                />
                <span className="block rounded-full px-4 py-2 text-sm font-medium peer-checked:bg-white peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-700">
                  {item}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {mode !== "Bell" && (
          <div className="mt-6 text-left">
            <label className="block text-sm font-medium" htmlFor="minutes">
              {mode === "Timer" ? "Timer duration (minutes)" : "Minutes between bells"}
            </label>
            <input
              id="minutes" type="number" min="0.01" max="1440" step="any"
              value={mode === "Timer" ? timerMinutes : intervalMinutes}
              onChange={(event) => {
                setStatus("");
                if (mode === "Timer") setTimerMinutes(event.target.value);
                else setIntervalMinutes(event.target.value);
              }}
              disabled={active} className={inputClass}
            />
            {mode === "Interval" && (
              <>
                <label className="mt-4 flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={ringAtStart}
                    onChange={(event) => setRingAtStart(event.target.checked)}
                    disabled={active}
                    className="size-4 accent-emerald-700"
                  />
                  Ring at start
                </label>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <label className="text-sm font-medium">
                    Start time (optional)
                    <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} disabled={active} className={inputClass} />
                  </label>
                  <label className="text-sm font-medium">
                    Stop time (optional)
                    <input type="time" value={stopTime} onChange={(event) => setStopTime(event.target.value)} disabled={active} className={inputClass} />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-stone-500">
                  Local time; a past time means its next occurrence. Ring at start plays a bell when the session begins, immediately or at the chosen start time. When unchecked, the first bell plays after one full interval. Leave stop time blank to continue until stopped. No bells play at or after the stop time.
                </p>
              </>
            )}
            <div className="mt-6 text-center">
              <p className="text-sm text-stone-600">
                {starting ? "Preparing bell…" : schedule ? waiting ? "Starting in" : stoppingNext ? "Session ends in" : "Next bell in" : mode === "Timer" ? status === "Timer complete." ? "Complete" : "Duration" : "Ready to start"}
              </p>
              {(schedule || mode === "Timer") && <p role="timer" aria-label="Countdown" className="mt-2 text-5xl font-light tabular-nums">{countdown(remaining)}</p>}
              {schedule?.end && <p className="mt-3 text-xs text-stone-500">Ends {new Date(schedule.end).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
            </div>
          </div>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={mode === "Bell" ? playBell : startSession}
            disabled={mode !== "Bell" && active}
            className="cursor-pointer rounded-full bg-emerald-700 disabled:cursor-default disabled:opacity-50 px-8 py-3 font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            {mode === "Bell" ? "Play bell" : active ? "Running" : `Start ${mode.toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={stopSession}
            className="cursor-pointer rounded-full border border-stone-300 px-8 py-3 font-medium transition-colors hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            Stop
          </button>
        </div>
        <div className="mx-auto mt-8 max-w-xs text-left">
          <div className="mb-3 flex items-center justify-between text-sm font-medium">
            <label htmlFor="volume">Volume</label>
            <output htmlFor="volume">{volume}%</output>
          </div>
          <input
            id="volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            aria-valuetext={`${volume}%`}
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              setVolume(nextVolume);
              volumeRef.current = nextVolume;
              if (audioRef.current && fadeFrameRef.current === null && !starting) {
                audioRef.current.volume = nextVolume / 100;
              }
            }}
            className="w-full cursor-pointer accent-emerald-700"
          />
        </div>
        <p role="status" className="mt-4 text-sm text-emerald-700">{status}</p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

export default App;
