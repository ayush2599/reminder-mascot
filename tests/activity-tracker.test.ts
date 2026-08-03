import { describe, expect, it } from "vitest";
import {
  closeStaleSegmentAfterRestart,
  enterIdle,
  recordFocusInterval,
  resumeFromIdle,
} from "../electron/activity-tracker";
import { createDefaultRuntime, createDefaultSettings } from "../shared/defaults";

describe("activity tracking", () => {
  it("removes the idle tail from focus time when the idle threshold is crossed", () => {
    const runtime = createDefaultRuntime("2026-08-04", createDefaultSettings());
    const tenOClock = new Date("2026-08-04T10:00:00.000Z").getTime();

    recordFocusInterval(runtime, tenOClock, tenOClock + 5 * 60_000);
    const removed = enterIdle(runtime, tenOClock + 3 * 60_000, tenOClock + 5 * 60_000);

    expect(removed).toBe(120);
    expect(runtime.activeSecondsToday).toBe(180);
    expect(runtime.currentSessionSeconds).toBe(0);
    expect(runtime.rhythm.map((segment) => [segment.type, segment.seconds])).toEqual([
      ["focus", 180],
      ["idle", 120],
    ]);
  });

  it("closes an away period and starts the next activity as a new focus session", () => {
    const runtime = createDefaultRuntime("2026-08-04", createDefaultSettings());
    const start = new Date("2026-08-04T10:00:00.000Z").getTime();

    recordFocusInterval(runtime, start, start + 10 * 60_000);
    enterIdle(runtime, start + 10 * 60_000, start + 25 * 60_000);
    expect(resumeFromIdle(runtime, start + 25 * 60_000)).toBe(15 * 60);
    recordFocusInterval(runtime, start + 25 * 60_000, start + 30 * 60_000);

    expect(runtime.currentSessionSeconds).toBe(5 * 60);
    expect(runtime.activeSecondsToday).toBe(15 * 60);
    expect(runtime.rhythm.map((segment) => segment.type)).toEqual(["focus", "idle", "focus"]);
  });

  it("does not stretch an unfinished focus segment across an app restart", () => {
    const runtime = createDefaultRuntime("2026-08-04", createDefaultSettings());
    const start = new Date("2026-08-04T10:00:00.000Z").getTime();
    recordFocusInterval(runtime, start, start + 60_000);

    closeStaleSegmentAfterRestart(runtime);

    expect(runtime.rhythm[0].endedAt).toBe("2026-08-04T10:01:00.000Z");
    expect(runtime.currentSessionSeconds).toBe(0);
  });
});
