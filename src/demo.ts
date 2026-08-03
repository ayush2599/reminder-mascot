import { createDefaultRuntime, createDefaultSettings } from "../shared/defaults";
import type { AppSnapshot, PurrPauseApi } from "../shared/types";

const settings = createDefaultSettings("Karn");
const runtime = createDefaultRuntime(
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
  settings,
);
runtime.activeSecondsToday = 3 * 3600 + 45 * 60;
runtime.currentSessionSeconds = 23 * 60 + 48;
runtime.breaksToday = 3;
runtime.pomodoroSecondsRemaining = 72;
runtime.mood = "proud";
runtime.mascotMessage = "Hey Karn, tiny stretch together?";
runtime.history = [
  {
    id: "demo-1",
    kind: "stand",
    title: "Stretch break",
    message: "Paws up — let’s stretch.",
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    outcome: "taken",
    durationMinutes: 5,
  },
  {
    id: "demo-2",
    kind: "water",
    title: "Hydration break",
    message: "Tiny water date?",
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    outcome: "taken",
    durationMinutes: 2,
  },
  {
    id: "demo-3",
    kind: "eyes",
    title: "Eye break",
    message: "Find a faraway point.",
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    outcome: "taken",
    durationMinutes: 2,
  },
];
const demoNow = Date.now();
const demoDayStart = new Date(demoNow).setHours(0, 0, 0, 0);
const demoDayLength = Math.max(10 * 60_000, demoNow - demoDayStart);
const demoSegment = (id: string, type: "focus" | "shortBreak" | "longBreak" | "idle", startRatio: number, endRatio: number) => {
  const startedAt = demoDayStart + demoDayLength * startRatio;
  const endedAt = demoDayStart + demoDayLength * endRatio;
  return {
    id,
    type,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    seconds: Math.max(1, Math.round((endedAt - startedAt) / 1000)),
  };
};
runtime.rhythm = [
  demoSegment("r1", "focus", 0.04, 0.24),
  demoSegment("r2", "idle", 0.24, 0.34),
  demoSegment("r3", "focus", 0.34, 0.54),
  demoSegment("r4", "shortBreak", 0.54, 0.6),
  demoSegment("r5", "focus", 0.6, 0.78),
  demoSegment("r6", "idle", 0.78, 0.88),
  demoSegment("r7", "focus", 0.88, 0.98),
];
runtime.activeSecondsToday = runtime.rhythm
  .filter((segment) => segment.type === "focus")
  .reduce((sum, segment) => sum + segment.seconds, 0);
runtime.currentSessionSeconds = runtime.rhythm.at(-1)?.seconds ?? 0;

let current: AppSnapshot = {
  settings,
  runtime,
  appVersion: "0.1.0-preview",
  platform: "browser-preview",
};
const listeners = new Set<(snapshot: AppSnapshot) => void>();
const update = (mutate: (draft: AppSnapshot) => void) => {
  current = structuredClone(current);
  mutate(current);
  listeners.forEach((listener) => listener(structuredClone(current)));
  return Promise.resolve(structuredClone(current));
};

export const demoApi: PurrPauseApi = {
  getSnapshot: async () => structuredClone(current),
  onSnapshot: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  updateSettings: (patch) =>
    update((draft) => {
      draft.settings = { ...draft.settings, ...patch };
    }),
  setPaused: (paused) =>
    update((draft) => {
      draft.runtime.paused = paused;
      draft.runtime.pauseReason = paused ? "manual" : null;
    }),
  resetSession: () =>
    update((draft) => {
      draft.runtime.currentSessionSeconds = 0;
    }),
  startBreak: (minutes = 5) =>
    update((draft) => {
      draft.runtime.breaksToday += 1;
      draft.runtime.paused = true;
      draft.runtime.pauseReason = "break";
      draft.runtime.breakSecondsRemaining = minutes * 60;
      draft.runtime.currentSessionSeconds = 0;
      draft.runtime.pendingReminder = null;
    }),
  completeReminder: () =>
    update((draft) => {
      draft.runtime.breaksToday += 1;
      draft.runtime.pendingReminder = null;
    }),
  snoozeReminder: (minutes = 10) =>
    update((draft) => {
      draft.runtime.snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      draft.runtime.pendingReminder = null;
    }),
  dismissReminder: () =>
    update((draft) => {
      draft.runtime.pendingReminder = null;
    }),
  addCustomNudge: (input) =>
    update((draft) => {
      draft.settings.customNudges.push({
        id: crypto.randomUUID(),
        enabled: true,
        title: input.title,
        message: input.message,
        scheduleType: input.scheduleType,
        time: input.time ?? "18:30",
        days: input.days ?? [1, 2, 3, 4, 5],
        activeMinutes: input.activeMinutes ?? 90,
      });
    }),
  deleteCustomNudge: (id) =>
    update((draft) => {
      draft.settings.customNudges = draft.settings.customNudges.filter((item) => item.id !== id);
    }),
  clearHistory: () =>
    update((draft) => {
      draft.runtime.history = [];
    }),
  exportHistory: async () => "preview-history.json",
  exportBackup: async () => "purrpause-backup.json",
  importBackup: async () => structuredClone(current),
  openExternal: async () => {},
  showDashboard: async () => {},
  hideMascot: async () => structuredClone(current),
};
