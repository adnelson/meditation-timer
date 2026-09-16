export type Mode = "Bell" | "Timer" | "Interval";
export type Schedule = {
  mode: "Timer" | "Interval";
  start: number;
  nextBell: number;
  period: number;
  end: number | null;
};

export function minutesToMs(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    throw new Error("Enter a duration greater than 0 and no more than 1,440 minutes.");
  }
  return minutes * 60_000;
}

function clockTime(value: string, relativeTo: number): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Enter a valid start or stop time.");
  }
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(relativeTo);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() < relativeTo) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function createSchedule(
  mode: "Timer" | "Interval",
  minutes: string,
  startTime: string,
  stopTime: string,
  now: number,
  ringAtStart = false,
): Schedule {
  const period = minutesToMs(minutes);
  const start = mode === "Interval" && startTime ? clockTime(startTime, now) : now;
  const end = mode === "Interval" && stopTime ? clockTime(stopTime, start) : null;
  const nextBell = mode === "Interval" && ringAtStart ? start : start + period;
  if (end !== null && nextBell >= end) {
    throw new Error("The stop time must be after the first bell.");
  }
  return { mode, start, nextBell, period, end };
}

export function advanceSchedule(schedule: Schedule, now: number): {
  ring: boolean;
  schedule: Schedule | null;
} {
  if (schedule.end !== null && now >= schedule.end) return { ring: false, schedule: null };
  if (now < schedule.nextBell) return { ring: false, schedule };
  if (schedule.mode === "Timer") return { ring: true, schedule: null };
  // Skip missed intervals after suspension without drifting or ringing in a burst.
  const elapsed = Math.floor((now - schedule.nextBell) / schedule.period) + 1;
  return { ring: true, schedule: { ...schedule, nextBell: schedule.nextBell + elapsed * schedule.period } };
}

export function countdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [ ...(hours ? [hours] : []), minutes, remainder ]
    .map((part) => String(part).padStart(2, "0")).join(":");
}
