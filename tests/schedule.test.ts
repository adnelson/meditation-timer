import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSchedule, countdown, countInToMs, createSchedule, elapsedTime, minutesToMs, timerDurationToMs } from "../src/schedule.ts";

const now = new Date(2026, 8, 15, 10, 0, 0).getTime();

test("timer rings once at its deadline", () => {
  const timer = createSchedule("Timer", "2", "", "", now);
  assert.equal(advanceSchedule(timer, now + 119_999).ring, false);
  assert.deepEqual(advanceSchedule(timer, now + 120_000), { ring: true, schedule: null });
});

test("timer accepts minutes:seconds durations", () => {
  assert.equal(timerDurationToMs("0:30"), 30_000);
  assert.equal(timerDurationToMs("10:01"), 601_000);
  assert.equal(timerDurationToMs("0.5"), 30_000);
  assert.equal(createSchedule("Timer", "0:30", "", "", now).nextBell, now + 30_000);
  for (const value of ["0:00", "1:60", "1:2", "-1:30", "1440:01", "abc:30"]) {
    assert.throws(() => timerDurationToMs(value));
  }
  assert.throws(() => createSchedule("Interval", "0:30", "", "", now));
});

test("timer count-in delays the start and ending bell", () => {
  const timer = createSchedule("Timer", "2", "", "", now, false, { countInMs: countInToMs("10") });
  assert.equal(timer.start, now + 10_000);
  assert.equal(timer.nextBell, now + 130_000);
  assert.equal(advanceSchedule(timer, now + 10_000).ring, false);
  assert.deepEqual(advanceSchedule(timer, now + 130_000), { ring: true, schedule: null });
});

test("optional timer start bell rings after count-in and ending bell still rings", () => {
  const timer = createSchedule("Timer", "2", "", "", now, false, { countInMs: countInToMs("10"), bellAtStart: true });
  assert.equal(advanceSchedule(timer, now + 9_999).ring, false);
  const started = advanceSchedule(timer, now + 10_000);
  assert.equal(started.ring, true);
  assert.equal(started.schedule?.nextBell, now + 130_000);
  assert.equal(advanceSchedule(started.schedule!, now + 10_000).ring, false);
  assert.deepEqual(advanceSchedule(started.schedule!, now + 130_000), { ring: true, schedule: null });
  assert.deepEqual(advanceSchedule(timer, now + 130_000), { ring: true, schedule: null });
});

test("count-in requires whole seconds within range", () => {
  assert.equal(countInToMs("10"), 10_000);
  for (const value of ["", "0", "1.5", "-1", "3601", "Infinity", "abc"]) {
    assert.throws(() => countInToMs(value));
  }
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

test("elapsed time rounds down and adds hours only when needed", () => {
  assert.equal(elapsedTime(600_999), "10:00");
  assert.equal(elapsedTime(601_000), "10:01");
  assert.equal(elapsedTime(3_661_000), "01:01:01");
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
