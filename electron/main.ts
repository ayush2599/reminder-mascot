import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  shell,
  Tray,
} from "electron";
import { createDefaultRuntime } from "../shared/defaults";
import type {
  AppSettings,
  AppSnapshot,
  CustomNudgeInput,
  ReminderEvent,
  ReminderKind,
  RuntimeState,
} from "../shared/types";
import {
  buildReminder,
  computeMood,
  dueHealthyKinds,
  isWithinQuietHours,
  localDateKey,
  messageForMood,
  nextDueAfterHandled,
  shouldTriggerClockNudge,
} from "./scheduler";
import {
  closeStaleSegmentAfterRestart,
  enterIdle,
  extendIdle,
  recordFocusInterval,
  recordRhythmInterval,
  resumeFromIdle,
} from "./activity-tracker";
import { queryWindowsNotificationState } from "./smart-quiet";
import { StateStore } from "./state-store";

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
if (process.env.PURRPAUSE_TEST_USER_DATA) {
  app.setPath("userData", process.env.PURRPAUSE_TEST_USER_DATA);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let dashboardWindow: BrowserWindow | null = null;
let mascotWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: StateStore;
let tickTimer: NodeJS.Timeout | null = null;
let hideMascotTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let lastSmartQuietCheck = 0;
let lastPersistAt = 0;
let smartQuietReason: string | null = null;
let applyingMascotBounds = false;
let mascotMoveSaveTimer: NodeJS.Timeout | null = null;
let lastTickAtMs: number | null = null;
let forcedAwaySinceMs: number | null = null;

function appUrl(view?: "mascot"): string {
  const suffix = view ? `?view=${view}` : "";
  if (process.env.VITE_DEV_SERVER_URL) return `${process.env.VITE_DEV_SERVER_URL}${suffix}`;
  const file = path.join(__dirname, "../dist/client/index.html");
  return `${pathToFileURL(file).href}${suffix}`;
}

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets/icon.png")
    : path.join(app.getAppPath(), "build/icon.png");
}

function snapshot(): AppSnapshot {
  const state = store.get();
  return {
    ...state,
    appVersion: app.getVersion(),
    platform: process.platform,
  };
}

function sendSnapshot(): AppSnapshot {
  const next = snapshot();
  for (const window of [dashboardWindow, mascotWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("purr:snapshot", next);
  }
  refreshTray();
  return next;
}

function save(settings: AppSettings, runtime: RuntimeState, force = false): AppSnapshot {
  const now = Date.now();
  if (force || now - lastPersistAt >= 5000) {
    store.replace({ settings, runtime }, true);
    lastPersistAt = now;
  } else {
    // Keep the in-memory source of truth current without excessive disk writes.
    store.replace({ settings, runtime }, false);
  }
  return sendSnapshot();
}

function createDashboard(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return;
  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1020,
    minHeight: 680,
    show: false,
    backgroundColor: "#fbf7ef",
    title: "PurrPause",
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dashboardWindow.loadURL(appUrl());
  dashboardWindow.once("ready-to-show", async () => {
    dashboardWindow?.show();
    const capturePath = process.env.PURRPAUSE_CAPTURE_PATH;
    if (capturePath && dashboardWindow) {
      dashboardWindow.setSize(1440, 1024);
      dashboardWindow.center();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const image = await dashboardWindow.capturePage();
      const fs = await import("node:fs/promises");
      await fs.mkdir(path.dirname(capturePath), { recursive: true });
      await fs.writeFile(capturePath, image.toPNG());
      const interactions = await dashboardWindow.webContents.executeJavaScript(`
        (() => {
          const buttons = [...document.querySelectorAll('button')];
          const reminders = buttons.find((button) => button.textContent?.trim() === 'Reminders');
          reminders?.click();
          const addCustom = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Add custom nudge'));
          const remindersOpened = Boolean(addCustom);
          const today = buttons.find((button) => button.textContent?.trim() === 'Today');
          today?.click();
          return { remindersOpened, buttonCount: buttons.length, bodyOverflow: getComputedStyle(document.body).overflow };
        })()
      `);
      console.log("PurrPause capture complete", { capturePath, interactions });
      isQuitting = true;
      app.quit();
    }
  });
  dashboardWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      dashboardWindow?.hide();
    }
  });
  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });
}

function positionMascot(): void {
  if (!mascotWindow || mascotWindow.isDestroyed()) return;
  const { mascotPosition, mascotSize, mascotCustomPosition } = store.get().settings;
  const area = (
    mascotCustomPosition
      ? screen.getDisplayNearestPoint(mascotCustomPosition)
      : screen.getPrimaryDisplay()
  ).workArea;
  const scale = Math.min(1.6, Math.max(0.6, mascotSize / 100));
  const width = Math.round(420 * scale);
  const height = Math.round(360 * scale);
  const margin = 14;
  const left = mascotPosition.endsWith("left");
  const top = mascotPosition.startsWith("top");
  const x = mascotCustomPosition
    ? Math.min(area.x + area.width - width, Math.max(area.x, mascotCustomPosition.x))
    : left
      ? area.x + margin
      : area.x + area.width - width - margin;
  const y = mascotCustomPosition
    ? Math.min(area.y + area.height - height, Math.max(area.y, mascotCustomPosition.y))
    : top
      ? area.y + margin
      : area.y + area.height - height - margin;
  applyingMascotBounds = true;
  mascotWindow.setBounds(
    {
      x,
      y,
      width,
      height,
    },
    false,
  );
  setTimeout(() => {
    applyingMascotBounds = false;
  }, 100);
}

function createMascot(): void {
  if (mascotWindow && !mascotWindow.isDestroyed()) return;
  mascotWindow = new BrowserWindow({
    width: 420,
    height: 360,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    roundedCorners: false,
    thickFrame: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mascotWindow.setAlwaysOnTop(true, "floating");
  mascotWindow.setIgnoreMouseEvents(false);
  mascotWindow.loadURL(appUrl("mascot"));
  mascotWindow.once("ready-to-show", () => {
    const { settings, runtime } = store.get();
    if (
      settings.mascotVisible &&
      settings.mascotMode === "always" &&
      !runtime.quietReason
    ) {
      mascotWindow?.showInactive();
    }
  });
  mascotWindow.on("closed", () => {
    mascotWindow = null;
  });
  mascotWindow.on("move", () => {
    if (!mascotWindow || applyingMascotBounds) return;
    if (mascotMoveSaveTimer) clearTimeout(mascotMoveSaveTimer);
    mascotMoveSaveTimer = setTimeout(() => {
      if (!mascotWindow || mascotWindow.isDestroyed()) return;
      const [x, y] = mascotWindow.getPosition();
      const { settings, runtime } = store.get();
      settings.mascotCustomPosition = { x, y };
      store.replace({ settings, runtime }, true);
    }, 120);
  });
  positionMascot();
}

function showMascot(durationMs = 22_000): void {
  const { settings, runtime } = store.get();
  if (!settings.mascotVisible || runtime.quietReason) return;
  createMascot();
  mascotWindow?.showInactive();
  if (hideMascotTimer) clearTimeout(hideMascotTimer);
  if (settings.mascotMode === "reminders") {
    hideMascotTimer = setTimeout(() => mascotWindow?.hide(), durationMs);
  }
}

function syncMascotWindow(reposition = false): void {
  const { settings, runtime } = store.get();
  if (!settings.mascotVisible || runtime.quietReason) {
    mascotWindow?.hide();
    return;
  }
  createMascot();
  if (reposition) positionMascot();
  if (settings.mascotMode === "always" && !mascotWindow?.isVisible()) {
    mascotWindow?.showInactive();
  }
}

function settleMascotAfterAction(settings: AppSettings): void {
  if (settings.mascotVisible && settings.mascotMode === "always") {
    syncMascotWindow();
    mascotWindow?.showInactive();
  } else {
    mascotWindow?.hide();
  }
}

function showDashboard(): void {
  createDashboard();
  dashboardWindow?.show();
  dashboardWindow?.focus();
}

function refreshTray(): void {
  if (!tray) return;
  const { settings, runtime } = store.get();
  tray.setToolTip(
    runtime.paused
      ? "PurrPause · tracking paused"
      : `PurrPause · ${formatCompact(runtime.currentSessionSeconds)} active`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open PurrPause", click: showDashboard },
      {
        label: runtime.paused ? "Resume tracking" : "Pause tracking",
        click: () => setPaused(!runtime.paused),
      },
      {
        label: "Show mascot",
        enabled: settings.mascotVisible,
        click: () => showMascot(60_000),
      },
      { type: "separator" },
      {
        label: "Take a 5 minute break",
        click: () => startBreak(5),
      },
      { type: "separator" },
      {
        label: "Quit PurrPause",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray(): void {
  const source = nativeImage.createFromPath(iconPath());
  const trayIcon = source.isEmpty() ? nativeImage.createEmpty() : source.resize({ width: 20, height: 20 });
  tray = new Tray(trayIcon);
  tray.on("click", showDashboard);
  refreshTray();
}

function formatCompact(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function recordEvent(
  runtime: RuntimeState,
  kind: ReminderKind,
  title: string,
  message: string,
  outcome: ReminderEvent["outcome"],
  durationMinutes?: number,
): void {
  runtime.history.unshift({
    id: crypto.randomUUID(),
    kind,
    title,
    message,
    createdAt: new Date().toISOString(),
    outcome,
    durationMinutes,
  });
  runtime.history = runtime.history.slice(0, 250);
}

function triggerReminder(
  settings: AppSettings,
  runtime: RuntimeState,
  kinds: ReminderKind[],
  custom?: { title: string; message: string },
): void {
  if (runtime.pendingReminder) return;
  runtime.pendingReminder = buildReminder(kinds, settings.displayName, custom);
  runtime.mood = computeMood(runtime);
  runtime.mascotMessage = runtime.pendingReminder.message;
  save(settings, runtime, true);
  showMascot();
  if (!settings.mascotVisible && Notification.isSupported()) {
    new Notification({
      title: runtime.pendingReminder.title,
      body: runtime.pendingReminder.message,
      silent: !settings.soundEnabled,
    }).show();
  }
}

async function updateQuietState(settings: AppSettings, runtime: RuntimeState): Promise<void> {
  const now = Date.now();
  if (now - lastSmartQuietCheck > 12_000) {
    lastSmartQuietCheck = now;
    smartQuietReason = settings.smartQuietEnabled
      ? (await queryWindowsNotificationState()).reason
      : null;
  }
  runtime.quietReason = isWithinQuietHours(new Date(), settings)
    ? "Quiet hours"
    : smartQuietReason;
  if (runtime.quietReason) mascotWindow?.hide();
  else if (settings.mascotMode === "always") syncMascotWindow();
}

function handlePomodoro(settings: AppSettings, runtime: RuntimeState, elapsedSeconds: number): void {
  if (settings.sessionMode !== "pomodoro" || runtime.pomodoroPhase !== "focus") return;
  runtime.pomodoroSecondsRemaining = Math.max(0, runtime.pomodoroSecondsRemaining - elapsedSeconds);
  if (runtime.pomodoroSecondsRemaining === 0 && !runtime.pendingReminder) {
    triggerReminder(settings, runtime, ["pomodoro"]);
  }
}

function resetForNewDay(settings: AppSettings, runtime: RuntimeState): RuntimeState {
  const fresh = createDefaultRuntime(localDateKey(), settings);
  fresh.history = runtime.history;
  return fresh;
}

async function tick(): Promise<void> {
  let { settings, runtime } = store.get();
  const nowMs = Date.now();
  let elapsedSeconds = lastTickAtMs === null
    ? 0
    : Math.max(0, Math.round((nowMs - lastTickAtMs) / 1000));
  const intervalStartedAtMs = lastTickAtMs ?? nowMs;
  lastTickAtMs = nowMs;

  if (runtime.dateKey !== localDateKey()) {
    runtime = resetForNewDay(settings, runtime);
    elapsedSeconds = 0;
  }

  const systemIdleSeconds = powerMonitor.getSystemIdleTime();
  const timerGapLooksAway = elapsedSeconds > settings.idleThresholdSeconds + 5;
  const idleStartedAtMs = forcedAwaySinceMs
    ?? (systemIdleSeconds >= settings.idleThresholdSeconds
      ? nowMs - systemIdleSeconds * 1000
      : timerGapLooksAway
        ? intervalStartedAtMs
        : null);
  const away = idleStartedAtMs !== null;
  const wasIdle = runtime.isIdle;
  runtime.idleSeconds = systemIdleSeconds;
  await updateQuietState(settings, runtime);

  if (runtime.pauseReason === "break" && runtime.breakSecondsRemaining > 0) {
    const consumedSeconds = Math.min(elapsedSeconds, runtime.breakSecondsRemaining);
    if (consumedSeconds > 0) {
      recordRhythmInterval(
        runtime,
        runtime.breakSecondsRemaining > 10 * 60 ? "longBreak" : "shortBreak",
        intervalStartedAtMs,
        intervalStartedAtMs + consumedSeconds * 1000,
      );
    }
    runtime.breakSecondsRemaining -= consumedSeconds;
    runtime.isIdle = away;
    if (runtime.breakSecondsRemaining === 0) {
      runtime.paused = false;
      runtime.pauseReason = null;
      runtime.mascotMessage = `Welcome back, ${settings.displayName}. Ready when you are.`;
      if (settings.sessionMode === "pomodoro") {
        runtime.pomodoroRound += 1;
        runtime.pomodoroPhase = "focus";
        runtime.pomodoroSecondsRemaining = settings.pomodoroFocusMinutes * 60;
      }
    }
  } else if (runtime.paused) {
    if (elapsedSeconds > 0) {
      recordRhythmInterval(runtime, "shortBreak", intervalStartedAtMs, nowMs);
    }
    runtime.isIdle = away;
  } else if (away && idleStartedAtMs !== null) {
    if (!wasIdle) enterIdle(runtime, idleStartedAtMs, nowMs);
    else extendIdle(runtime, idleStartedAtMs, nowMs);
  } else {
    if (wasIdle) {
      const awaySeconds = resumeFromIdle(runtime, nowMs);
      if (awaySeconds >= settings.idleThresholdSeconds) {
        runtime.breaksToday += 1;
        const pending = runtime.pendingReminder;
        if (pending && awaySeconds >= pending.suggestedBreakMinutes * 60) {
          const durationMinutes = Math.max(1, Math.round(awaySeconds / 60));
          for (const kind of pending.kinds) {
            recordEvent(runtime, kind, pending.title, pending.message, "taken", durationMinutes);
          }
          runtime.nextDueByKind = nextDueAfterHandled(runtime, settings, pending.kinds);
          runtime.pendingReminder = null;
          settleMascotAfterAction(settings);
        }
      }
    }
    const activeSeconds = elapsedSeconds;
    if (activeSeconds > 0) {
      recordFocusInterval(runtime, nowMs - activeSeconds * 1000, nowMs);
      handlePomodoro(settings, runtime, activeSeconds);
    }
  }

  const pendingAgeMs = runtime.pendingReminder
    ? nowMs - new Date(runtime.pendingReminder.createdAt).getTime()
    : 0;
  if (runtime.pendingReminder && !runtime.isIdle && pendingAgeMs >= 2 * 60_000) {
    const pending = runtime.pendingReminder;
    for (const kind of pending.kinds) {
      recordEvent(runtime, kind, pending.title, pending.message, "delayed");
    }
    runtime.pendingReminder = null;
    runtime.snoozedUntil = new Date(nowMs + settings.snoozeMinutes * 60_000).toISOString();
    settleMascotAfterAction(settings);
  }

  runtime.mood = computeMood(runtime);
  if (!runtime.pendingReminder) {
    runtime.mascotMessage = messageForMood(runtime.mood, settings.displayName);
  }

  const snoozed = runtime.snoozedUntil && new Date(runtime.snoozedUntil).getTime() > Date.now();
  if (!runtime.pendingReminder && !runtime.quietReason && !snoozed) {
    const due = dueHealthyKinds(runtime);
    if (due.length) triggerReminder(settings, runtime, due);

    for (const nudge of settings.customNudges) {
      const activeDue =
        nudge.enabled &&
        nudge.scheduleType === "active" &&
        runtime.activeSecondsToday >= (nudge.nextDueActiveSeconds ?? nudge.activeMinutes * 60);
      if (shouldTriggerClockNudge(new Date(), nudge) || activeDue) {
        nudge.lastTriggeredDate = localDateKey();
        nudge.nextDueActiveSeconds = runtime.activeSecondsToday + nudge.activeMinutes * 60;
        save(settings, runtime, true);
        triggerReminder(settings, runtime, ["custom"], { title: nudge.title, message: nudge.message });
        break;
      }
    }
  }

  save(settings, runtime);
}

function markSystemAway(): void {
  if (forcedAwaySinceMs !== null) return;
  const nowMs = Date.now();
  const idleSeconds = powerMonitor.getSystemIdleTime();
  forcedAwaySinceMs = nowMs - idleSeconds * 1000;
  const { settings, runtime } = store.get();
  runtime.idleSeconds = idleSeconds;
  if (!runtime.paused) enterIdle(runtime, forcedAwaySinceMs, nowMs);
  else runtime.isIdle = true;
  save(settings, runtime, true);
}

function clearSystemAway(): void {
  const nowMs = Date.now();
  const { settings, runtime } = store.get();
  if (forcedAwaySinceMs !== null && runtime.isIdle && !runtime.paused) {
    extendIdle(runtime, forcedAwaySinceMs, nowMs);
  }
  forcedAwaySinceMs = null;
  lastTickAtMs = nowMs;
  save(settings, runtime, true);
  setTimeout(() => void tick(), 250);
}

function registerPowerEvents(): void {
  powerMonitor.on("suspend", markSystemAway);
  powerMonitor.on("lock-screen", markSystemAway);
  powerMonitor.on("user-did-resign-active", markSystemAway);
  powerMonitor.on("resume", clearSystemAway);
  powerMonitor.on("unlock-screen", clearSystemAway);
  powerMonitor.on("user-did-become-active", clearSystemAway);
}

function setPaused(paused: boolean): AppSnapshot {
  const { settings, runtime } = store.get();
  runtime.paused = paused;
  runtime.pauseReason = paused ? "manual" : null;
  return save(settings, runtime, true);
}

function resetSession(): AppSnapshot {
  const { settings, runtime } = store.get();
  runtime.currentSessionSeconds = 0;
  runtime.pomodoroRound = 1;
  runtime.pomodoroPhase = "focus";
  runtime.pomodoroSecondsRemaining = settings.pomodoroFocusMinutes * 60;
  runtime.pendingReminder = null;
  return save(settings, runtime, true);
}

function handlePending(outcome: ReminderEvent["outcome"], durationMinutes?: number): void {
  const { settings, runtime } = store.get();
  const pending = runtime.pendingReminder;
  if (!pending) return;
  for (const kind of pending.kinds) {
    recordEvent(runtime, kind, pending.title, pending.message, outcome, durationMinutes);
  }
  runtime.nextDueByKind = nextDueAfterHandled(runtime, settings, pending.kinds);
  runtime.pendingReminder = null;
  save(settings, runtime, true);
}

function startBreak(minutes = 5): AppSnapshot {
  const { settings, runtime } = store.get();
  const pending = runtime.pendingReminder;
  if (pending) {
    for (const kind of pending.kinds) {
      recordEvent(runtime, kind, pending.title, pending.message, "taken", minutes);
    }
    runtime.nextDueByKind = nextDueAfterHandled(runtime, settings, pending.kinds);
  } else {
    recordEvent(runtime, "stand", "Break started", "A mindful pause", "taken", minutes);
  }
  runtime.pendingReminder = null;
  runtime.breaksToday += 1;
  runtime.currentSessionSeconds = 0;
  runtime.paused = true;
  runtime.pauseReason = "break";
  runtime.breakSecondsRemaining = minutes * 60;
  runtime.pomodoroPhase = minutes >= 10 ? "longBreak" : "break";
  const updated = save(settings, runtime, true);
  settleMascotAfterAction(settings);
  return updated;
}

function registerIpc(): void {
  ipcMain.handle("purr:get-snapshot", () => snapshot());
  ipcMain.handle("purr:update-settings", (_event, patch: Partial<AppSettings>) => {
    const { settings, runtime } = store.get();
    const next = {
      ...settings,
      ...patch,
      reminderIntervals: { ...settings.reminderIntervals, ...patch.reminderIntervals },
      quietHours: { ...settings.quietHours, ...patch.quietHours },
    };
    if (patch.mascotPosition !== undefined) next.mascotCustomPosition = null;
    if (patch.autoLaunch !== undefined) {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: patch.autoLaunch });
    }
    if (patch.mascotVisible === false) mascotWindow?.hide();
    const updated = save(next, runtime, true);
    if (
      patch.mascotVisible !== undefined ||
      patch.mascotMode !== undefined ||
      patch.mascotSize !== undefined ||
      patch.mascotPosition !== undefined
    ) {
      syncMascotWindow(
        patch.mascotSize !== undefined || patch.mascotPosition !== undefined,
      );
    }
    return updated;
  });
  ipcMain.handle("purr:set-paused", (_event, paused: boolean) => setPaused(paused));
  ipcMain.handle("purr:reset-session", () => resetSession());
  ipcMain.handle("purr:start-break", (_event, minutes?: number) => startBreak(minutes));
  ipcMain.handle("purr:complete-reminder", () => {
    const minutes = store.get().runtime.pendingReminder?.suggestedBreakMinutes ?? 5;
    return startBreak(minutes);
  });
  ipcMain.handle("purr:snooze-reminder", (_event, minutes?: number) => {
    const { settings, runtime } = store.get();
    const duration = minutes ?? settings.snoozeMinutes;
    if (runtime.pendingReminder) {
      handlePending("snoozed", duration);
      const current = store.get();
      current.runtime.snoozedUntil = new Date(Date.now() + duration * 60_000).toISOString();
      const updated = save(current.settings, current.runtime, true);
      settleMascotAfterAction(current.settings);
      return updated;
    }
    return snapshot();
  });
  ipcMain.handle("purr:dismiss-reminder", () => {
    handlePending("dismissed");
    settleMascotAfterAction(store.get().settings);
    return snapshot();
  });
  ipcMain.handle("purr:add-custom", (_event, input: CustomNudgeInput) => {
    const { settings, runtime } = store.get();
    settings.customNudges.push({
      id: crypto.randomUUID(),
      title: input.title,
      message: input.message,
      enabled: true,
      scheduleType: input.scheduleType,
      time: input.time ?? "18:30",
      days: input.days ?? [1, 2, 3, 4, 5],
      activeMinutes: input.activeMinutes ?? 90,
      nextDueActiveSeconds:
        input.scheduleType === "active"
          ? runtime.activeSecondsToday + (input.activeMinutes ?? 90) * 60
          : undefined,
    });
    return save(settings, runtime, true);
  });
  ipcMain.handle("purr:delete-custom", (_event, id: string) => {
    const { settings, runtime } = store.get();
    settings.customNudges = settings.customNudges.filter((nudge) => nudge.id !== id);
    return save(settings, runtime, true);
  });
  ipcMain.handle("purr:clear-history", () => {
    const { settings, runtime } = store.get();
    runtime.history = [];
    return save(settings, runtime, true);
  });
  ipcMain.handle("purr:export-history", async () => {
    const result = await dialog.showSaveDialog({
      title: "Export reminder history",
      defaultPath: `purrpause-history-${localDateKey()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const content = JSON.stringify(store.get().runtime.history, null, 2);
    await import("node:fs/promises").then((fs) => fs.writeFile(result.filePath!, content, "utf8"));
    shell.showItemInFolder(result.filePath);
    return result.filePath;
  });
  ipcMain.handle("purr:export-backup", async () => {
    const result = await dialog.showSaveDialog({
      title: "Back up PurrPause",
      defaultPath: `purrpause-backup-${localDateKey()}.json`,
      filters: [{ name: "PurrPause backup", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const payload = {
      format: "purrpause-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: store.get(),
    };
    const fs = await import("node:fs/promises");
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf8");
    shell.showItemInFolder(result.filePath);
    return result.filePath;
  });
  ipcMain.handle("purr:import-backup", async () => {
    const result = await dialog.showOpenDialog({
      title: "Restore a PurrPause backup",
      properties: ["openFile"],
      filters: [{ name: "PurrPause backup", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    try {
      const fs = await import("node:fs/promises");
      const restored = store.import(JSON.parse(await fs.readFile(result.filePaths[0], "utf8")));
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: restored.settings.autoLaunch });
      }
      sendSnapshot();
      syncMascotWindow(true);
      return snapshot();
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "Could not restore backup",
        message: error instanceof Error ? error.message : "The selected file is not a valid PurrPause backup.",
      });
      return null;
    }
  });
  ipcMain.handle("purr:open-external", async (_event, url: string) => {
    if (url === "https://github.com/ayush2599") await shell.openExternal(url);
  });
  ipcMain.handle("purr:show-dashboard", () => showDashboard());
  ipcMain.handle("purr:hide-mascot", () => {
    const { settings, runtime } = store.get();
    mascotWindow?.hide();
    if (settings.mascotMode === "always") {
      settings.mascotVisible = false;
      return save(settings, runtime, true);
    }
    return snapshot();
  });
}

async function boot(): Promise<void> {
  app.setAppUserModelId("com.purrpause.desktop");
  store = new StateStore();
  const initial = store.get();
  closeStaleSegmentAfterRestart(initial.runtime);
  store.replace(initial, true);
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: store.get().settings.autoLaunch });
  registerPowerEvents();
  registerIpc();
  createDashboard();
  createMascot();
  createTray();
  tickTimer = setInterval(() => void tick(), 1000);
  await tick();
  syncMascotWindow(true);
  const mascotCapturePath = process.env.PURRPAUSE_MASCOT_CAPTURE_PATH;
  if (mascotCapturePath) {
    const { settings, runtime } = store.get();
    const captureIdle = process.env.PURRPAUSE_CAPTURE_IDLE === "1";
    settings.mascotVisible = true;
    settings.mascotMode = "always";
    settings.mascotSize = Number(process.env.PURRPAUSE_CAPTURE_SIZE ?? 100);
    settings.mascotCustomPosition = null;
    runtime.pendingReminder = captureIdle ? null : buildReminder(["stand"], settings.displayName);
    runtime.mood = captureIdle ? "sleepy" : "concerned";
    runtime.mascotMessage = runtime.pendingReminder?.message ?? "";
    save(settings, runtime, true);
    syncMascotWindow(true);
    if (mascotWindow?.webContents.isLoading()) {
      await new Promise<void>((resolve) => {
        mascotWindow?.webContents.once("did-finish-load", () => resolve());
      });
    }
    await new Promise((resolve) => setTimeout(resolve, captureIdle ? 500 : 1800));
    if (mascotWindow) {
      let dragPersisted: boolean | null = null;
      if (process.env.PURRPAUSE_TEST_DRAG === "1") {
        const before = mascotWindow.getBounds();
        mascotWindow.setPosition(before.x - 36, before.y - 24, false);
        await new Promise((resolve) => setTimeout(resolve, 1400));
        const after = mascotWindow.getBounds();
        const savedPosition = store.get().settings.mascotCustomPosition;
        dragPersisted =
          savedPosition?.x === after.x &&
          savedPosition?.y === after.y &&
          after.x === before.x - 36 &&
          after.y === before.y - 24;
      }
      const rendererMetrics = await mascotWindow.webContents.executeJavaScript(`
        (() => ({
          htmlClient: [document.documentElement.clientWidth, document.documentElement.clientHeight],
          htmlScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          bodyClient: [document.body.clientWidth, document.body.clientHeight],
          bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
          bubbleCount: document.querySelectorAll('.speech-bubble').length,
          imageSource: document.querySelector('.mascot-image')?.getAttribute('src') ?? null
        }))()
      `);
      const image = await mascotWindow.capturePage();
      const fs = await import("node:fs/promises");
      await fs.mkdir(path.dirname(mascotCapturePath), { recursive: true });
      await fs.writeFile(mascotCapturePath, image.toPNG());
      await fs.writeFile(
        `${mascotCapturePath}.json`,
        JSON.stringify(
          {
            bounds: mascotWindow.getBounds(),
            rendererMetrics,
            dragPersisted,
          },
          null,
          2,
        ),
        "utf8",
      );
      console.log("PurrPause mascot capture complete", {
        mascotCapturePath,
        bounds: mascotWindow.getBounds(),
        transparent: mascotWindow.isVisible(),
      });
    }
    isQuitting = true;
    app.quit();
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", showDashboard);
  app.whenReady().then(boot);
}

app.on("activate", showDashboard);
app.on("before-quit", () => {
  isQuitting = true;
  if (tickTimer) clearInterval(tickTimer);
});
app.on("window-all-closed", () => {
  // Keep the tray process alive until the user explicitly quits.
});
