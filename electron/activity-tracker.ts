import type { FocusDay, RhythmSegment, RuntimeState } from "../shared/types";

type RhythmType = RhythmSegment["type"];

const MAX_DAILY_SEGMENTS = 500;

function toIso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function openSegment(runtime: RuntimeState): RhythmSegment | undefined {
  const segment = runtime.rhythm.at(-1);
  return segment && !segment.endedAt ? segment : undefined;
}

export function closeOpenSegment(runtime: RuntimeState, endedAtMs: number): void {
  const segment = openSegment(runtime);
  if (!segment) return;
  const startedAtMs = Date.parse(segment.startedAt);
  const safeEnd = Math.max(startedAtMs, endedAtMs);
  segment.seconds = Math.max(0, Math.round((safeEnd - startedAtMs) / 1000));
  segment.endedAt = toIso(safeEnd);
}

export function recordRhythmInterval(
  runtime: RuntimeState,
  type: RhythmType,
  startedAtMs: number,
  endedAtMs: number,
): void {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs <= startedAtMs) return;

  const last = openSegment(runtime);
  if (last?.type === type) {
    const lastStartedAtMs = Date.parse(last.startedAt);
    last.seconds = Math.max(last.seconds, Math.round((endedAtMs - lastStartedAtMs) / 1000));
    return;
  }

  closeOpenSegment(runtime, startedAtMs);
  runtime.rhythm.push({
    id: crypto.randomUUID(),
    type,
    startedAt: toIso(startedAtMs),
    seconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000)),
  });
  runtime.rhythm = runtime.rhythm.slice(-MAX_DAILY_SEGMENTS);
}

export function recordFocusInterval(
  runtime: RuntimeState,
  startedAtMs: number,
  endedAtMs: number,
): number {
  const seconds = Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
  if (!seconds) return 0;
  runtime.activeSecondsToday += seconds;
  runtime.currentSessionSeconds += seconds;
  recordRhythmInterval(runtime, "focus", startedAtMs, endedAtMs);
  return seconds;
}

export function enterIdle(
  runtime: RuntimeState,
  idleStartedAtMs: number,
  nowMs: number,
): number {
  const last = openSegment(runtime);
  let removedActiveSeconds = 0;

  if (last?.type === "focus") {
    const focusStartedAtMs = Date.parse(last.startedAt);
    const correctedSeconds = Math.max(0, Math.round((idleStartedAtMs - focusStartedAtMs) / 1000));
    removedActiveSeconds = Math.max(0, last.seconds - correctedSeconds);
    runtime.activeSecondsToday = Math.max(0, runtime.activeSecondsToday - removedActiveSeconds);

    if (correctedSeconds === 0) {
      runtime.rhythm.pop();
    } else {
      last.seconds = correctedSeconds;
      last.endedAt = toIso(idleStartedAtMs);
    }
  } else {
    closeOpenSegment(runtime, idleStartedAtMs);
  }

  runtime.currentSessionSeconds = 0;
  runtime.isIdle = true;
  recordRhythmInterval(runtime, "idle", idleStartedAtMs, nowMs);
  return removedActiveSeconds;
}

export function extendIdle(runtime: RuntimeState, idleStartedAtMs: number, nowMs: number): void {
  runtime.isIdle = true;
  recordRhythmInterval(runtime, "idle", idleStartedAtMs, nowMs);
}

export function resumeFromIdle(runtime: RuntimeState, nowMs: number): number {
  const last = openSegment(runtime);
  const awaySeconds = last?.type === "idle"
    ? Math.max(0, Math.round((nowMs - Date.parse(last.startedAt)) / 1000))
    : 0;
  closeOpenSegment(runtime, nowMs);
  runtime.isIdle = false;
  runtime.idleSeconds = 0;
  runtime.currentSessionSeconds = 0;
  return awaySeconds;
}

export function closeStaleSegmentAfterRestart(runtime: RuntimeState): void {
  const last = openSegment(runtime);
  if (!last) return;
  const storedEndMs = Date.parse(last.startedAt) + last.seconds * 1000;
  last.endedAt = toIso(storedEndMs);
  runtime.currentSessionSeconds = 0;
  runtime.isIdle = false;
  runtime.idleSeconds = 0;
}

export function archiveFocusDay(runtime: RuntimeState): FocusDay | null {
  const rhythm = runtime.rhythm.map((segment) => ({ ...segment }));
  if (!rhythm.length && runtime.activeSecondsToday === 0 && runtime.breaksToday === 0) return null;
  return {
    dateKey: runtime.dateKey,
    activeSeconds: runtime.activeSecondsToday,
    breaksToday: runtime.breaksToday,
    rhythm,
  };
}

