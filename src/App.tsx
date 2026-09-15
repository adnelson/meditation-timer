import { useEffect, useRef, useState } from "react";

function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(50);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (fadeFrameRef.current !== null) {
        cancelAnimationFrame(fadeFrameRef.current);
      }
    };
  }, []);

  async function playBell() {
    const audio = audioRef.current;
    if (!audio) return;

    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
    audio.volume = volume / 100;
    audio.currentTime = 0;
    setError("");

    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("The bell could not be played. Please try again.");
    }
  }

  function stopBell() {
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
  }

  return (
    <main className="grid min-h-svh place-items-center bg-stone-50 px-6 text-stone-900">
      <section className="max-w-md text-center">
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
        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={playBell}
            className="cursor-pointer rounded-full bg-emerald-700 px-8 py-3 font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            Play bell
          </button>
          <button
            type="button"
            onClick={stopBell}
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
              if (audioRef.current && fadeFrameRef.current === null) {
                audioRef.current.volume = nextVolume / 100;
              }
            }}
            className="w-full cursor-pointer accent-emerald-700"
          />
        </div>
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
