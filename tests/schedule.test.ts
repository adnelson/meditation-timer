import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSchedule, countdown, createSchedule, minutesToMs } from "../src/schedule.ts";

const now = new Date(2026, 8, 15, 10, 0, 0).getTime();

test("timer rings once at its deadline", () => {
  const timer = createSchedule("Timer", "2", "", "", now);
  assert.equal(advanceSchedule(timer, now + 119_999).ring, false);
  assert.deepEqual(advanceSchedule(timer, now + 120_000), { ring: true, schedule: null });
});

test("interval waits a full interval and skips missed bells without drifting", () => {
  const interval = createSchedule("Interval", "5", "", "", now);
  assert.equal(advanceSchedule(interval, now).ring, false);
  const result = advanceSchedule(interval, now + 16 * 60_000);
  assert.equal(result.ring, true);
  assert.equal(result.schedule?.nextBell, now + 20 * 60_000);
  assert.equal(advanceSchedule(result.schedule!, now + 16 * 60_000).ring, false);
});

test("scheduled start and overnight stop use local clock times", () => {
  const interval = createSchedule("Interval", "15", "23:00", "01:00", now, true);
  assert.equal(interval.start, new Date(2026, 8, 15, 23).getTime());
  assert.equal(interval.nextBell, interval.start);
  assert.equal(interval.end, new Date(2026, 8, 16, 1).getTime());
  assert.deepEqual(advanceSchedule(interval, interval.end!), { ring: false, schedule: null });
});

test("explicit start rings once at the start, then on the configured interval", () => {
  const interval = createSchedule("Interval", "5", "10:30", "", now, true);
  assert.equal(advanceSchedule(interval, interval.start - 1).ring, false);
  const first = advanceSchedule(interval, interval.start);
  assert.equal(first.ring, true);
  assert.equal(first.schedule?.nextBell, interval.start + 5 * 60_000);
  assert.equal(advanceSchedule(first.schedule!, interval.start).ring, false);
  assert.equal(advanceSchedule(first.schedule!, interval.start + 5 * 60_000).ring, true);
});

test("scheduled start allows a window shorter than the interval", () => {
  const interval = createSchedule("Interval", "15", "10:30", "10:35", now, true);
  assert.equal(advanceSchedule(interval, interval.start).ring, true);
  assert.deepEqual(advanceSchedule(interval, interval.end!), { ring: false, schedule: null });
  assert.throws(() => createSchedule("Interval", "15", "10:30", "10:30", now, true));
});

test("past start times use their next occurrence; stop-only works", () => {
  const nextDay = createSchedule("Interval", "5", "09:00", "", now);
  assert.equal(nextDay.start, new Date(2026, 8, 16, 9).getTime());
  const stopOnly = createSchedule("Interval", "5", "", "11:00", now);
  assert.equal(stopOnly.start, now);
  assert.equal(stopOnly.end, new Date(2026, 8, 15, 11).getTime());
});

test("no bell at or after the stop boundary, even after suspension", () => {
  const interval = createSchedule("Interval", "5", "", "10:10", now);
  assert.equal(advanceSchedule(interval, now + 5 * 60_000).ring, true);
  assert.deepEqual(advanceSchedule(interval, now + 10 * 60_000), { ring: false, schedule: null });
  assert.deepEqual(advanceSchedule(interval, now + 60 * 60_000), { ring: false, schedule: null });
});

test("reject invalid durations and windows with no room for a bell", () => {
  for (const value of ["", "0", "-1", "NaN", "Infinity", "1441"]) {
    assert.throws(() => minutesToMs(value));
  }
  assert.equal(minutesToMs("0.01"), 600);
  assert.throws(() => createSchedule("Interval", "10", "", "10:05", now));
  assert.throws(() => createSchedule("Interval", "5", "25:00", "", now));
});

test("countdown rounds up and supports hours", () => {
  assert.equal(countdown(1001), "00:02");
  assert.equal(countdown(-1), "00:00");
  assert.equal(countdown(3_661_000), "01:01:01");
});

for (const startTime of ["", "10:30"]) {
  for (const ringAtStart of [false, true]) {
    test(`ringAtStart=${ringAtStart} with ${startTime || "immediate"} start`, () => {
      const interval = createSchedule("Interval", "5", startTime, "", now, ringAtStart);
      assert.equal(interval.nextBell, interval.start + (ringAtStart ? 0 : 5 * 60_000));
      const result = advanceSchedule(interval, interval.start);
      assert.equal(result.ring, ringAtStart);
      assert.equal(result.schedule?.nextBell, interval.start + 5 * 60_000);
      assert.equal(advanceSchedule(result.schedule!, interval.start).ring, false);
      assert.equal(advanceSchedule(result.schedule!, interval.start + 5 * 60_000).ring, true);
    });
  }
}

test("ring at start does not change Timer mode", () => {
  const timer = createSchedule("Timer", "5", "", "", now, true);
  assert.equal(timer.nextBell, now + 5 * 60_000);
  assert.equal(advanceSchedule(timer, now).ring, false);
});
