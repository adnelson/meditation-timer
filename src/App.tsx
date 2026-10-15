import { useCallback, useEffect, useRef, useState } from "react";

import { advanceSchedule, countdown, countInToMs, createSchedule, elapsedTime, minutesToMs, timerDurationToMs } from "./schedule";
import type { Mode, Schedule } from "./schedule";
import { loadSettings, saveSettings } from "./settings";

function App() {
  const [initialSettings] = useState(loadSettings);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const volumeRef = useRef(initialSettings.volume);
  const actionRef = useRef(0);
  const scheduleRef = useRef<Schedule | null>(null);
  const completedTimerRef = useRef<{ start: number; deadline: number } | null>(null);
  const [mode, setMode] = useState<Mode>(initialSettings.mode);
  const [timerMinutes, setTimerMinutes] = useState(initialSettings.timerMinutes);
  const [addCountIn, setAddCountIn] = useState(initialSettings.addCountIn);
  const [countInSeconds, setCountInSeconds] = useState(initialSettings.countInSeconds);
  const [timerBellAtStart, setTimerBellAtStart] = useState(initialSettings.timerBellAtStart);
  const [keepAwake, setKeepAwake] = useState(initialSettings.keepAwake);
  const [intervalMinutes, setIntervalMinutes] = useState(initialSettings.intervalMinutes);
  const [ringAtStart, setRingAtStart] = useState(initialSettings.ringAtStart);
  const [startTime, setStartTime] = useState(initialSettings.startTime);
  const [stopTime, setStopTime] = useState(initialSettings.stopTime);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [completedTimer, setCompletedTimer] = useState<{ start: number; deadline: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");
  const [volume, setVolume] = useState(initialSettings.volume);
  const [error, setError] = useState("");
  const timerSessionActive = schedule?.mode === "Timer" || completedTimer !== null;

  useEffect(() => {
    saveSettings({ mode, timerMinutes, addCountIn, countInSeconds, timerBellAtStart, keepAwake, intervalMinutes, ringAtStart, startTime, stopTime, volume });
  }, [mode, timerMinutes, addCountIn, countInSeconds, timerBellAtStart, keepAwake, intervalMinutes, ringAtStart, startTime, stopTime, volume]);

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
      const time = Date.now();
      if (!current) {
        if (completedTimerRef.current) setNow(time);
        return;
      }
      setNow(time);
      const result = advanceSchedule(current, time);
      scheduleRef.current = result.schedule;
      setSchedule(result.schedule);
      if (result.ring) void playBell();
      if (!result.schedule) {
        if (current.mode === "Interval") stopBell();
        else {
          const completed = { start: current.start, deadline: current.start + current.period };
          completedTimerRef.current = completed;
          setCompletedTimer(completed);
        }
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

  useEffect(() => {
    if (!timerSessionActive || !keepAwake || !navigator.wakeLock) return;
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | null = null;

    async function acquire() {
      if (disposed || pending || lock || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (disposed || document.visibilityState !== "visible") {
          void acquired.release();
        } else {
          lock = acquired;
          acquired.addEventListener("release", onRelease);
        }
      } catch {
        // Unsupported or denied wake locks should not interrupt the timer.
      } finally {
        pending = false;
      }
    }

    function onRelease() {
      lock = null;
      if (!disposed) void acquire();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
      else if (lock) {
        lock.removeEventListener("release", onRelease);
        void lock.release();
        lock = null;
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void acquire();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (lock) {
        lock.removeEventListener("release", onRelease);
        void lock.release();
      }
    };
  }, [timerSessionActive, keepAwake]);

  function stopSession() {
    // Cancel future bells immediately; let the shared 500 ms fade stop current audio.
    actionRef.current += 1;
    scheduleRef.current = null;
    completedTimerRef.current = null;
    setSchedule(null);
    setCompletedTimer(null);
    setStarting(false);
    setStatus("");
    stopBell();
  }

  async function startSession() {
    if (mode === "Bell") return;
    const action = ++actionRef.current;
    try {
      const countInMs = mode === "Timer" && addCountIn ? countInToMs(countInSeconds) : 0;
      if (mode === "Timer") timerDurationToMs(timerMinutes);
      else minutesToMs(intervalMinutes);
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
      const next = createSchedule(mode, mode === "Timer" ? timerMinutes : intervalMinutes, startTime, stopTime, Date.now(), ringAtStart, {
        countInMs,
        bellAtStart: mode === "Timer" && timerBellAtStart,
      });
      scheduleRef.current = next;
      completedTimerRef.current = null;
      setSchedule(next);
      setCompletedTimer(null);
      setNow(Date.now());
    } catch (error) {
      if (actionRef.current !== action) return;
      setError(error instanceof Error ? error.message : "Unable to start the bell. Please try again.");
    } finally {
      if (actionRef.current === action) setStarting(false);
    }
  }

  const active = starting || schedule !== null || completedTimer !== null;
  const waiting = schedule !== null && now < schedule.start;
  const stoppingNext = schedule !== null && schedule.end !== null && schedule.end <= schedule.nextBell;
  let remaining = 0;
  if (schedule) {
    remaining = (waiting ? schedule.start : schedule.mode === "Timer" ? schedule.start + schedule.period : stoppingNext ? schedule.end! : schedule.nextBell) - now;
  } else if (mode === "Timer" && !completedTimer) {
    try { remaining = timerDurationToMs(timerMinutes); } catch { /* Invalid input is explained on Start. */ }
  }
  const showingElapsed = completedTimer !== null && now >= completedTimer.deadline + 1000;
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
              {mode === "Timer" ? "Timer duration (minutes:seconds)" : "Minutes between bells"}
            </label>
            <input
              id="minutes" type={mode === "Timer" ? "text" : "number"}
              {...(mode === "Timer" ? { placeholder: "10:00", inputMode: "text" as const } : { min: "0.01", max: "1440", step: "any" })}
              value={mode === "Timer" ? timerMinutes : intervalMinutes}
              onChange={(event) => {
                setStatus("");
                if (mode === "Timer") setTimerMinutes(event.target.value);
                else setIntervalMinutes(event.target.value);
              }}
              disabled={active} className={inputClass}
            />
            {mode === "Timer" && <p className="mt-2 text-xs text-stone-500">Use minutes:seconds (for example, 0:30), or enter minutes.</p>}
            {mode === "Timer" && (
              <>
                <label className="mt-4 flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={addCountIn} onChange={(event) => setAddCountIn(event.target.checked)} disabled={active} className="size-4 accent-emerald-700" />
                  Add count-in
                </label>
                {addCountIn && (
                  <label className="mt-4 block text-sm font-medium" htmlFor="count-in-seconds">
                    Count-in (seconds)
                    <input id="count-in-seconds" type="number" min="1" max="3600" step="1" value={countInSeconds} onChange={(event) => setCountInSeconds(event.target.value)} disabled={active} className={inputClass} />
                  </label>
                )}
                <label className="mt-4 flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={timerBellAtStart} onChange={(event) => setTimerBellAtStart(event.target.checked)} disabled={active} className="size-4 accent-emerald-700" />
                  Play bell at timer start
                </label>
                <label className="mt-4 flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={keepAwake} onChange={(event) => setKeepAwake(event.target.checked)} disabled={active} className="size-4 accent-emerald-700" />
                  Keep screen awake while timer runs
                </label>
              </>
            )}
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
              <p className={`text-sm ${showingElapsed ? "font-medium text-amber-700" : "text-stone-600"}`}>
                {starting ? "Preparing bell…" : schedule ? waiting ? "Starting in" : schedule.mode === "Timer" ? "Timer ends in" : stoppingNext ? "Session ends in" : "Next bell in" : completedTimer ? showingElapsed ? "Total time" : "Complete" : mode === "Timer" ? "Duration" : "Ready to start"}
              </p>
              {(schedule || mode === "Timer") && <p role="timer" aria-label={showingElapsed ? "Total time" : "Countdown"} className={`mt-2 text-5xl font-light tabular-nums ${showingElapsed ? "text-amber-700" : ""}`}>{showingElapsed ? elapsedTime(now - completedTimer!.start) : countdown(remaining)}</p>}
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
            {mode === "Bell" ? "Play bell" : completedTimer ? "Completed" : active ? "Running" : `Start ${mode.toLowerCase()}`}
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
