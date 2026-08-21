export type ReminderKind = "eyes" | "water" | "stand" | "walk" | "custom" | "pomodoro";
export type ReminderOutcome = "taken" | "snoozed" | "dismissed" | "delayed";
export type ThemeMode = "light" | "dark" | "system";
export type SessionMode = "balanced" | "pomodoro";
export type CatMood = "content" | "proud" | "playful" | "sleepy" | "concerned";
export type MascotMode = "reminders" | "always";
export type MascotPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface ReminderIntervals {
  eyes: number;
  water: number;
  stand: number;
  walk: number;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface CustomNudge {
  id: string;
  title: string;
  message: string;
  enabled: boolean;
  scheduleType: "time" | "active";
  time: string;
  days: number[];
  activeMinutes: number;
  lastTriggeredDate?: string;
  nextDueActiveSeconds?: number;
}

export interface AppSettings {
  settingsVersion: number;
  displayName: string;
  theme: ThemeMode;
  sessionMode: SessionMode;
  reminderIntervals: ReminderIntervals;
  idleThresholdSeconds: number;
  snoozeMinutes: number;
  soundEnabled: boolean;
  catSoundsEnabled: boolean;
  catSoundVolume: number;
  mascotVisible: boolean;
  mascotMode: MascotMode;
  mascotSize: number;
  mascotOpacity: number;
  mascotPosition: MascotPosition;
  mascotCustomPosition: { x: number; y: number } | null;
  mascotAnimation: boolean;
  reducedMotion: boolean;
  smartQuietEnabled: boolean;
  quietHours: QuietHours;
  autoLaunch: boolean;
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  customNudges: CustomNudge[];
}

export interface ReminderEvent {
  id: string;
  kind: ReminderKind;
  title: string;
  message: string;
  createdAt: string;
  outcome: ReminderOutcome;
  durationMinutes?: number;
}

export interface PendingReminder {
  id: string;
  kinds: ReminderKind[];
  title: string;
  message: string;
  createdAt: string;
  suggestedBreakMinutes: number;
}

export interface RhythmSegment {
  id: string;
  type: "focus" | "shortBreak" | "longBreak" | "idle";
  startedAt: string;
  endedAt?: string;
  seconds: number;
}

export interface FocusDay {
  dateKey: string;
  activeSeconds: number;
  breaksToday: number;
  rhythm: RhythmSegment[];
}

export interface RuntimeState {
  dateKey: string;
  paused: boolean;
  pauseReason: "manual" | "break" | null;
  isIdle: boolean;
  idleSeconds: number;
  activeSecondsToday: number;
  currentSessionSeconds: number;
  breaksToday: number;
  pomodoroRound: number;
  pomodoroPhase: "focus" | "break" | "longBreak";
  pomodoroSecondsRemaining: number;
  breakSecondsRemaining: number;
  snoozedUntil: string | null;
  quietReason: string | null;
  pendingReminder: PendingReminder | null;
  nextDueByKind: Record<Exclude<ReminderKind, "custom" | "pomodoro">, number>;
  history: ReminderEvent[];
  rhythm: RhythmSegment[];
  focusHistory: FocusDay[];
  mood: CatMood;
  mascotMessage: string;
}

export interface AppSnapshot {
  settings: AppSettings;
  runtime: RuntimeState;
  appVersion: string;
  platform: string;
}

export interface CustomNudgeInput {
  title: string;
  message: string;
  scheduleType: "time" | "active";
  time?: string;
  days?: number[];
  activeMinutes?: number;
}

export interface PurrPauseApi {
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSnapshot>;
  setPaused(paused: boolean): Promise<AppSnapshot>;
  resetSession(): Promise<AppSnapshot>;
  startBreak(minutes?: number): Promise<AppSnapshot>;
  completeReminder(): Promise<AppSnapshot>;
  snoozeReminder(minutes?: number): Promise<AppSnapshot>;
  dismissReminder(): Promise<AppSnapshot>;
  addCustomNudge(input: CustomNudgeInput): Promise<AppSnapshot>;
  deleteCustomNudge(id: string): Promise<AppSnapshot>;
  clearHistory(): Promise<AppSnapshot>;
  exportHistory(): Promise<string | null>;
  exportBackup(): Promise<string | null>;
  importBackup(): Promise<AppSnapshot | null>;
  openExternal(url: string): Promise<void>;
  showDashboard(): Promise<void>;
  hideMascot(): Promise<AppSnapshot>;
}

declare global {
  interface Window {
    purrPause?: PurrPauseApi;
  }
}
