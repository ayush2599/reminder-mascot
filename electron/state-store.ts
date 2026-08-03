import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createDefaultRuntime, createDefaultSettings } from "../shared/defaults";
import type { AppSettings, RuntimeState } from "../shared/types";
import { localDateKey } from "./scheduler";

export interface PersistedState {
  settings: AppSettings;
  runtime: RuntimeState;
}

function friendlyOsName(): string {
  const raw = process.env.USERNAME || process.env.USER || "Friend";
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export class StateStore {
  private readonly filePath = path.join(app.getPath("userData"), "purrpause-state.json");
  private state: PersistedState;

  constructor() {
    this.state = this.load();
  }

  get(): PersistedState {
    return structuredClone(this.state);
  }

  replace(next: PersistedState, persist = true): PersistedState {
    this.state = next;
    if (persist) this.persist();
    return this.get();
  }

  import(candidate: unknown): PersistedState {
    if (!candidate || typeof candidate !== "object") throw new Error("This is not a PurrPause backup.");
    const backup = candidate as { settings?: unknown; runtime?: unknown; data?: Partial<PersistedState> };
    const source = backup.data ?? backup;
    if (!source.settings || !source.runtime) throw new Error("The backup is missing settings or history.");
    const defaults = createDefaultSettings(friendlyOsName());
    const saved = source as Partial<PersistedState>;
    const settings: AppSettings = {
      ...defaults,
      ...saved.settings,
      reminderIntervals: { ...defaults.reminderIntervals, ...saved.settings?.reminderIntervals },
      quietHours: { ...defaults.quietHours, ...saved.settings?.quietHours },
      customNudges: saved.settings?.customNudges ?? defaults.customNudges,
    };
    const savedVersion = saved.settings?.settingsVersion ?? 0;
    if (savedVersion < 2) {
      settings.catSoundsEnabled = true;
    }
    settings.settingsVersion = 3;
    settings.mascotOpacity = Math.min(100, Math.max(20, settings.mascotOpacity ?? 100));
    const runtimeDefaults = createDefaultRuntime(localDateKey(), settings);
    const runtime: RuntimeState = {
      ...runtimeDefaults,
      ...saved.runtime,
      nextDueByKind: { ...runtimeDefaults.nextDueByKind, ...saved.runtime?.nextDueByKind },
      history: saved.runtime?.history ?? [],
      rhythm: saved.runtime?.rhythm ?? [],
    };
    if (savedVersion < 3) {
      runtime.activeSecondsToday = 0;
      runtime.currentSessionSeconds = 0;
      runtime.isIdle = false;
      runtime.idleSeconds = 0;
      runtime.rhythm = [];
      runtime.nextDueByKind = runtimeDefaults.nextDueByKind;
    }
    return this.replace({ settings, runtime }, true);
  }

  private load(): PersistedState {
    const defaults = createDefaultSettings(friendlyOsName());
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<PersistedState>;
      const settings: AppSettings = {
        ...defaults,
        ...saved.settings,
        reminderIntervals: {
          ...defaults.reminderIntervals,
          ...saved.settings?.reminderIntervals,
        },
        quietHours: { ...defaults.quietHours, ...saved.settings?.quietHours },
        customNudges: saved.settings?.customNudges ?? defaults.customNudges,
      };
      const savedVersion = saved.settings?.settingsVersion ?? 0;
      if (savedVersion < 2) {
        settings.catSoundsEnabled = true;
      }
      settings.settingsVersion = 3;
      settings.mascotOpacity = Math.min(100, Math.max(20, settings.mascotOpacity ?? 100));
      const runtimeDefaults = createDefaultRuntime(localDateKey(), settings);
      const runtime: RuntimeState = {
        ...runtimeDefaults,
        ...saved.runtime,
        nextDueByKind: {
          ...runtimeDefaults.nextDueByKind,
          ...saved.runtime?.nextDueByKind,
        },
        history: saved.runtime?.history ?? [],
        rhythm: saved.runtime?.rhythm ?? [],
      };
      if (savedVersion < 3) {
        runtime.activeSecondsToday = 0;
        runtime.currentSessionSeconds = 0;
        runtime.isIdle = false;
        runtime.idleSeconds = 0;
        runtime.rhythm = [];
        runtime.nextDueByKind = runtimeDefaults.nextDueByKind;
      }
      return { settings, runtime };
    } catch {
      return {
        settings: defaults,
        runtime: createDefaultRuntime(localDateKey(), defaults),
      };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
}
