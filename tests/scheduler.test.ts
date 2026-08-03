import { describe, expect, it } from "vitest";
import { createDefaultRuntime, createDefaultSettings } from "../shared/defaults";
import {
  buildReminder,
  computeMood,
  dueHealthyKinds,
  isWithinQuietHours,
  nextDueAfterHandled,
  shouldTriggerClockNudge,
} from "../electron/scheduler";

describe("healthy reminder scheduling", () => {
  it("uses active-time thresholds and combines due reminders", () => {
    const settings = createDefaultSettings("Karn");
    const runtime = createDefaultRuntime("2026-07-31", settings);
    runtime.activeSecondsToday = 51 * 60;

    expect(dueHealthyKinds(runtime)).toEqual(["stand", "water", "eyes"]);
    const reminder = buildReminder(dueHealthyKinds(runtime), "Karn");
    expect(reminder.kinds).toEqual(["stand", "water", "eyes"]);
    expect(reminder.message).toContain("Karn");
  });

  it("moves each handled threshold from the current active total", () => {
    const settings = createDefaultSettings("Karn");
    const runtime = createDefaultRuntime("2026-07-31", settings);
    runtime.activeSecondsToday = 51 * 60;
    const next = nextDueAfterHandled(runtime, settings, ["stand", "water", "eyes"]);

    expect(next.eyes).toBe(71 * 60);
    expect(next.water).toBe(96 * 60);
    expect(next.stand).toBe(101 * 60);
    expect(next.walk).toBe(90 * 60);
  });
});

describe("quiet behavior", () => {
  it("supports quiet hours that cross midnight", () => {
    const settings = createDefaultSettings();
    settings.quietHours = { enabled: true, start: "20:00", end: "08:00" };
    expect(isWithinQuietHours(new Date(2026, 6, 31, 23, 0), settings)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 6, 31, 9, 0), settings)).toBe(false);
  });
});

describe("custom nudges and moods", () => {
  it("triggers a clock nudge only on selected days and once per date", () => {
    const settings = createDefaultSettings();
    const nudge = { ...settings.customNudges[0], enabled: true, time: "18:30", days: [5] };
    const friday = new Date(2026, 6, 31, 18, 30);
    expect(shouldTriggerClockNudge(friday, nudge)).toBe(true);
    nudge.lastTriggeredDate = "2026-07-31";
    expect(shouldTriggerClockNudge(friday, nudge)).toBe(false);
  });

  it("makes the mascot proud after three breaks", () => {
    const settings = createDefaultSettings();
    const runtime = createDefaultRuntime("2026-07-31", settings);
    runtime.breaksToday = 3;
    expect(computeMood(runtime)).toBe("proud");
  });
});
