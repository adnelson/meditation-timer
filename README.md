# Meditation Timer

A basic React + TypeScript app built with Vite and Tailwind CSS.

## Setup

Use Node.js 24 LTS. Yarn 4.18.0 is pinned in `package.json` and managed by Corepack.

```sh
corepack enable
yarn install
yarn dev
```

Open the local URL printed by Vite.

## Commands

- `yarn dev` starts the development server.
- `yarn build` checks TypeScript and builds the app into `dist/`.
- `yarn lint` runs Oxlint.
- `yarn test` checks scheduling and countdown behavior.
- `yarn preview` serves the production build locally.

## Project structure

- `src/App.tsx`: mode controls, countdown, and bell playback.
- `src/schedule.ts`: timer and interval scheduling.
- `src/index.css`: Tailwind CSS entry point.
- `vite.config.ts`: React and Tailwind Vite plugins.

Yarn uses `node_modules` for editor and tool compatibility. Commit `yarn.lock`
to keep dependency installs reproducible.

## Modes

- **Bell:** play the bell manually; Stop fades it out over half a second.
- **Timer:** choose a duration in minutes or minutes:seconds (such as `0:30`), then Start.
  The timer ends with one bell. Once it reaches zero, it shows total elapsed time
  until Stop is pressed.
  Optionally add a count-in (10 seconds by default) before the timer starts. The
  start bell and screen wake lock are enabled by default. The start bell rings
  after the count-in, if one is selected. The screen wake lock is held while
  the timer is active and the tab is visible, when the browser supports it.
- **Interval:** choose the minutes between bells and optional local start/stop times.
  A past clock time means its next occurrence, including overnight windows. Enable **Ring at start** to ring when the session begins, either immediately or
  at the scheduled start time. This option is on by default. With it off, the first bell
  plays after one full interval.
  No new bell plays at or after the
  stop time, and any playing bell fades out when the session ends.

Stop cancels the session and fades out the bell. Changing modes also cancels the
session. The volume setting applies to every mode. Timer durations accept
fractional minutes or minutes:seconds up to 1,440 minutes (24 hours). Interval
durations accept fractional minutes.

Keep the page open for scheduled bells. Browser suspension
can delay playback; after resuming, missed intervals produce at most one bell,
and sessions past their stop time finish silently. Reloading clears the session.

Mode, timer duration, count-in, timer start bell, screen wake lock, interval,
ring-at-start preference, start/stop times, and volume
are saved in localStorage and restored when you reopen the page. Active sessions
are not resumed. Invalid saved values fall back to defaults; if storage is
unavailable, settings continue to work for the current visit.
