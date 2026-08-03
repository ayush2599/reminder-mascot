import type { AppSettings, RuntimeState } from "./types";

export const DEFAULT_INTERVALS = {
  eyes: 20,
  water: 45,
  stand: 50,
  walk: 90,
} as const;

export function createDefaultSettings(displayName = "Friend"): AppSettings {
  return {
    settingsVersion: 3,
    displayName,
    theme: "light",
    sessionMode: "balanced",
    reminderIntervals: { ...DEFAULT_INTERVALS },
    idleThresholdSeconds: 120,
    snoozeMinutes: 10,
    soundEnabled: false,
    catSoundsEnabled: true,
    mascotVisible: true,
    mascotMode: "reminders",
    mascotSize: 100,
    mascotOpacity: 100,
    mascotPosition: "bottom-right",
    mascotCustomPosition: null,
    mascotAnimation: true,
    reducedMotion: false,
    smartQuietEnabled: true,
    quietHours: { enabled: false, start: "20:00", end: "08:00" },
    autoLaunch: true,
    pomodoroFocusMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    customNudges: [
      {
        id: "welcome-workout",
        title: "Workout",
        message: "A little movement date with yourself?",
        enabled: false,
        scheduleType: "time",
        time: "18:30",
        days: [1, 2, 3, 4, 5],
        activeMinutes: 90,
      },
    ],
  };
}

export function createDefaultRuntime(dateKey: string, settings: AppSettings): RuntimeState {
  const toSeconds = (minutes: number) => minutes * 60;
  return {
    dateKey,
    paused: false,
    pauseReason: null,
    isIdle: false,
    idleSeconds: 0,
    activeSecondsToday: 0,
    currentSessionSeconds: 0,
    breaksToday: 0,
    pomodoroRound: 1,
    pomodoroPhase: "focus",
    pomodoroSecondsRemaining: toSeconds(settings.pomodoroFocusMinutes),
    breakSecondsRemaining: 0,
    snoozedUntil: null,
    quietReason: null,
    pendingReminder: null,
    nextDueByKind: {
      eyes: toSeconds(settings.reminderIntervals.eyes),
      water: toSeconds(settings.reminderIntervals.water),
      stand: toSeconds(settings.reminderIntervals.stand),
      walk: toSeconds(settings.reminderIntervals.walk),
    },
    history: [],
    rhythm: [],
    mood: "content",
    mascotMessage: `All settled in, ${settings.displayName}?`,
  };
}
