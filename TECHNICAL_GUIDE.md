# PurrPause Technical Guide

This document explains the current PurrPause codebase as it exists in this repository. It is written for someone who wants to run the app locally, debug it, change behavior, add cat poses or sounds, restyle the dashboard, and produce a new Windows installer.

PurrPause is a Windows-first Electron application. The Electron main process owns the tray icon, windows, timer, persistence, Windows idle/notification APIs, and IPC. The React renderer owns the dashboard and mascot visuals. The `shared/` folder contains the contracts used by both sides.

## 1. Repository structure

```text
reminder-mascot/
├─ electron/
│  ├─ main.ts                 Electron lifecycle, tray, windows, timer, IPC
│  ├─ activity-tracker.ts     Focus/away boundaries and restart safety
│  ├─ preload.ts              Safe renderer-to-main API bridge
│  ├─ scheduler.ts            Reminder thresholds, messages, moods, quiet hours
│  ├─ smart-quiet.ts          Windows notification/presentation state detection
│  └─ state-store.ts          Local JSON persistence and backup restore validation
├─ shared/
│  ├─ types.ts                TypeScript contracts for settings, runtime, IPC
│  └─ defaults.ts             Default settings and new-day runtime state
├─ src/
│  ├─ App.tsx                 React dashboard, mascot window, settings and views
│  ├─ styles.css              All dashboard and mascot styling/animations
│  ├─ main.tsx                React/Vite renderer entrypoint
│  ├─ usePurrPause.ts         Snapshot subscription and theme/motion application
│  ├─ demo.ts                 Browser-only in-memory API fallback
│  ├─ catSounds.ts            Procedural meow and purr Web Audio functions
│  ├─ format.ts               Time/duration formatting helpers
│  └─ assets/mascot/          Cat posture and source image assets
├─ scripts/
│  ├─ prepare-sites-build.mjs Copies required static/Sites artifacts into dist
│  ├─ capture-electron.mjs    Native dashboard capture helper
│  ├─ capture-electron.cjs    Native dashboard capture helper with evidence
│  └─ ...                     Other repository support scripts
├─ tests/
│  ├─ activity-tracker.test.ts Idle correction and session-boundary tests
│  ├─ scheduler.test.ts       Reminder, mood, quiet-hours and nudge tests
│  └─ sites-worker.test.mjs   Worker/static fallback tests
├─ worker/index.js            Sites static asset and SPA fallback worker
├─ build/icon.png             Source Windows app/tray icon
├─ design/                    Reference images, QA captures and comparisons
├─ vite.config.ts             Vite + React + Electron build configuration
├─ vitest.config.ts           Vitest configuration
├─ tsconfig.json              TypeScript compiler configuration
├─ package.json               Scripts, dependencies and electron-builder config
├─ pnpm-lock.yaml             Locked dependency versions
├─ pnpm-workspace.yaml        pnpm workspace/build permissions
├─ README.md                  Short project overview and quick start
├─ AGENTS.md                  Durable project/product implementation rules
├─ LICENSE                    MIT license
└─ TECHNICAL_GUIDE.md         This document
```

Generated directories should not be edited by hand:

- `node_modules/`: installed dependencies.
- `dist/client/`: Vite renderer output.
- `dist-electron/`: compiled Electron main/preload output.
- `dist/server/` and `dist/.openai/`: generated Sites handoff files.
- `release/`: NSIS installer and unpacked Windows build.

## 2. Runtime architecture

```text
Windows starts PurrPause
        │
        ▼
electron/main.ts
  ├─ StateStore loads %APPDATA%/purrpause-state.json
  ├─ creates dashboard BrowserWindow
  ├─ creates transparent mascot BrowserWindow
  ├─ creates Tray and menu
  └─ starts one-second tick()
        │
        ├─ powerMonitor.getSystemIdleTime()
        ├─ smart-quiet.ts → Windows notification/presentation state
        ├─ scheduler.ts → due reminders and mood
        ├─ StateStore persistence
        └─ IPC snapshot → preload.ts → React
                                      │
                                      ├─ Dashboard views/settings
                                      └─ Mascot view (?view=mascot)
```

There is one source of truth for the live app: `StateStore`. React receives immutable snapshots through the preload API. The renderer never writes the state JSON directly and never receives unrestricted Node/Electron access.

## 3. Electron main-process modules

### `electron/main.ts`

This is the application orchestrator.

Important functions:

- `appUrl(view?)`: selects the Vite dev URL or packaged `dist/client/index.html`; `view=mascot` selects the mascot route.
- `iconPath()`: selects `build/icon.png` in development or the packaged `resources/assets/icon.png` at runtime.
- `snapshot()`: combines persisted settings/runtime with app version/platform.
- `sendSnapshot()`: broadcasts `purr:snapshot` to dashboard and mascot windows and refreshes the tray tooltip/menu.
- `save(settings, runtime, force)`: persists immediately when forced and throttles ordinary one-second writes to approximately five seconds.
- `createDashboard()`: creates the normal 1280×840 dashboard window and keeps it alive in the tray when closed.
- `positionMascot()`: computes mascot size and position from `mascotSize`, `mascotPosition`, and `mascotCustomPosition`, including multi-display nearest-display handling.
- `createMascot()`: creates the transparent, frameless, always-on-top mascot window. The cat image region is a native drag region; the bubble/buttons are marked no-drag in CSS.
- `showMascot()`: shows a reminder-only popup and applies the 22-second reminder visibility timer. In always-visible mode it does not auto-hide.
- `syncMascotWindow(reposition)`: shows/hides the always-visible mascot without repositioning it on every timer tick. Repositioning only happens for an explicit size/corner change or startup.
- `settleMascotAfterAction()`: keeps the cat visible without its bubble in always mode, or hides it in reminder-only mode after complete/snooze/dismiss.
- `refreshTray()` / `createTray()`: create the tray menu for open, pause/resume, show mascot, take break, and quit.
- `recordEvent()`: adds a completed/snoozed/dismissed reminder to history.
- `triggerReminder()`: builds a pending reminder, updates mood/message, persists, and shows the mascot or Windows notification.
- `updateQuietState()`: checks quiet hours and Windows smart-quiet state.
- `handlePomodoro()`: decrements the focus countdown and triggers a Pomodoro reminder at zero.
- `tick()`: the one-second end-to-end work loop.
- `setPaused()` / `resetSession()` / `handlePending()` / `startBreak()`: session and reminder actions.
- `registerIpc()`: registers every `purr:*` handler exposed to React.
- `boot()`: initializes app ID, store, IPC, windows, tray, tick timer, and optional native capture hooks.

The heartbeat also listens to Windows lock, suspend/resume, and active/inactive events. A long timer gap is treated conservatively as away time so sleep cannot become false focus time.

### `electron/activity-tracker.ts`

This pure module owns focus/away timeline bookkeeping and is covered by `tests/activity-tracker.test.ts`.

- `recordFocusInterval()`: adds verified active seconds and extends the current focus segment.
- `enterIdle()`: closes focus at the last Windows input and removes any idle tail counted during the grace threshold.
- `resumeFromIdle()`: closes the away segment and resets the session counter so the next activity becomes a new session.
- `closeStaleSegmentAfterRestart()`: prevents an open segment from stretching across an app shutdown or restart.

The mascot window uses these key `BrowserWindow` settings:

```ts
frame: false,
transparent: true,
backgroundColor: "#00000000",
hasShadow: false,
alwaysOnTop: true,
skipTaskbar: true,
focusable: false,
```

`mascotWindow.setAlwaysOnTop(true, "floating")` is the line that keeps the mascot above normal windows. If you want it above more aggressive full-screen/topmost windows, experiment with the `level` argument (`"floating"`, `"torn-off-menu"`, etc.), but expect platform-specific behavior and possible user annoyance.

### `electron/preload.ts`

Defines the safe `window.purrPause` API with `contextBridge.exposeInMainWorld`. Each method maps to one IPC channel, for example:

```ts
updateSettings: (patch) => ipcRenderer.invoke("purr:update-settings", patch)
completeReminder: () => ipcRenderer.invoke("purr:complete-reminder")
exportBackup: () => ipcRenderer.invoke("purr:export-backup")
```

When adding a new renderer-to-main operation, update all three places:

1. Add the method to `PurrPauseApi` in `shared/types.ts`.
2. Add the implementation in `electron/preload.ts`.
3. Add the matching `ipcMain.handle(...)` in `electron/main.ts`.

Also update `src/demo.ts` so browser preview still works.

### `electron/scheduler.ts`

Pure scheduling/domain logic, intentionally separated from Electron APIs.

- `localDateKey()`: local `YYYY-MM-DD` key.
- `dueHealthyKinds()`: returns healthy reminder kinds whose active-second threshold has been reached.
- `buildReminder()`: sorts/composes multiple due kinds, chooses title/message, and suggests break duration.
- `nextDueAfterHandled()`: resets handled thresholds from the current active total.
- `isWithinQuietHours()`: supports normal and midnight-crossing quiet windows.
- `computeMood()`: derives sleepy, concerned, playful, proud, or content from runtime.
- `messageForMood()`: idle/ambient message generator.
- `shouldTriggerClockNudge()`: checks selected weekday, clock time, enabled state, and once-per-day guard.

The current healthy defaults are defined in `shared/defaults.ts`:

| Reminder | Default active time |
|---|---:|
| Eye break | 20 min |
| Water | 45 min |
| Stand/stretch | 50 min |
| Walk/body movement | 90 min |
| Pomodoro | 25 min focus / 5 min break |

Idle time does not advance `activeSecondsToday` or `currentSessionSeconds`.

### `electron/smart-quiet.ts`

On Windows, dynamically loads `shell32.dll` through `koffi` and calls `SHQueryUserNotificationState`. States such as busy/DND, full-screen, presentation mode, and Windows quiet time suppress mascot popups. This is best-effort OS notification state detection; it is not a direct Microsoft Teams presence API.

### `electron/state-store.ts`

`StateStore` owns local JSON persistence.

- File path: `app.getPath("userData")/purrpause-state.json`.
- On Windows this is normally under the user’s AppData application-data directory.
- `friendlyOsName()` supplies the initial display name from `USERNAME`/`USER`.
- `load()` merges saved data with defaults so new settings can be added without breaking old installs.
- `replace()` updates memory and optionally writes atomically through a temporary file and rename.
- `import()` validates a backup shape, merges it with current defaults, and restores settings/runtime/history.

The `settingsVersion` migration currently upgrades pre-0.4 state, adds mascot opacity, and resets the older unreliable same-day activity timeline once. Preferences, custom nudges, and reminder history are preserved. If you add a breaking setting migration, increment `settingsVersion` and handle it in both `load()` and `import()`.

## 4. Shared state contracts

### `shared/types.ts`

Important types:

- `ReminderKind`: `eyes | water | stand | walk | custom | pomodoro`.
- `AppSettings`: user preferences, intervals, themes, mascot mode/size/position, sound, quiet hours, Pomodoro, custom nudges.
- `RuntimeState`: current day, pause/idle state, active seconds, break count, Pomodoro state, pending reminder, next thresholds, history, rhythm, mood, mascot message.
- `AppSnapshot`: `{ settings, runtime, appVersion, platform }` sent to the renderer.
- `PendingReminder`: current actionable reminder and suggested break length.
- `PurrPauseApi`: the typed preload surface.

### `shared/defaults.ts`

Change defaults here, not in React. `createDefaultSettings()` controls new installs and the defaults used when saved state is incomplete. `createDefaultRuntime()` creates a new day and initializes next-due thresholds.

## 5. React renderer modules

### `src/main.tsx`

Loads fonts and third-party styles, then mounts `<App />` in React Strict Mode.

### `src/usePurrPause.ts`

`usePurrPause()` chooses the real `window.purrPause` API in Electron or `demoApi` in a browser. It fetches the initial snapshot, subscribes to `purr:snapshot`, cleans up the listener, and applies `data-theme` / `data-motion` attributes to `<html>`.

### `src/App.tsx`

This is the main UI module.

Asset selection:

- `catAsset(snapshot)`: chooses the transparent posture based on pending reminder first, then ambient mood.
- Eye reminder → `cat-eyes.png`.
- Water reminder → `cat-active.png`.
- Stand reminder → `cat-stretch.png`.
- Walk/workout custom reminder → `cat-workout.png`.
- Sleepy mood → `cat-sleepy.png`.
- Other ambient moods → `cat-proud.png`.

Mascot UI:

- `TypingBubble`: reveals reminder text character-by-character and shows a caret.
- `MascotScene`: renders image, bubble when needed, and dashboard mood chip.
- `MascotWindow`: renders transparent popup, native drag surface, reminder actions, ambient gesture timer, and optional meow/purr calls.

Dashboard components:

- `Sidebar`: navigation, profile, theme switch, Ayush/GitHub credit.
- `StatusBar`: sounds, smart quiet, and mascot visibility indicators.
- `Rhythm`: wall-clock focus/away/break timeline with color-blind-safe patterns.
- `TodayView`: active timer, focus ring, current rhythm, metrics, recent nudges, next custom nudge, dashboard mascot.
- `SessionsView`: Pomodoro presets and pause/reset controls.
- `HistoryView`: reminder history, export history, clear history.
- `RemindersView`: healthy intervals and custom nudge list.
- `SettingsView`: name, mascot mode, size, opacity, position, animations, sounds, auto-launch, quiet mode, theme, backup/restore.
- `SettingRow`: reusable setting label/control layout.
- `CustomNudgeModal`: clock-time or active-time custom reminder form.
- `Dashboard`: selected-view shell and modal state.
- `App`: selects dashboard versus `?view=mascot`.

### `src/styles.css`

All visual tokens and layout live here:

- `:root` and `:root[data-theme="dark"]`: colors, fonts, shadows, spacing-related variables.
- `.app-shell`, `.sidebar`, `.main-canvas`: dashboard structure.
- `.today-grid`, `.focus-ring`, `.rhythm-track`, `.status-bar`: Today screen.
- `.reminder-card`, `.history-list`, `.settings-sections`, `.modal`: feature views.
- `.floating-mascot`, `.mascot-image`, `.speech-bubble`, `.mascot-actions`: popup visuals.
- `@keyframes mascot-breathe`, `mascot-tilt`, `mascot-bounce`, `mascot-peek`, `mascot-smile`: ambient behavior.
- `@media (max-width: 300px)`: minimum-size popup layout; update this when changing popup geometry.

The mascot window must keep these rules:

```css
html:has(body[data-view="mascot"]) { min-width: 0; overflow: hidden; }
body[data-view="mascot"],
body[data-view="mascot"] #root { width: 100vw; height: 100vh; overflow: hidden; }
.floating-mascot { -webkit-app-region: drag; }
.speech-bubble, .mascot-actions, .mascot-close { -webkit-app-region: no-drag; }
```

If you add a visible background, border, or `min-width` to the mascot route, test at 60% size because that is where scrollbars and clipping appear first.

### `src/catSounds.ts`

Uses Web Audio oscillators rather than external files:

- `playTinyMeow()`: short triangle/sine frequency sweep.
- `playSoftPurr()`: low sawtooth carrier with LFO modulation and low-pass filtering.

The ambient timer in `MascotWindow` calls one occasionally when `catSoundsEnabled` and `mascotMode === "always"`. The manual Meow button is shown in the idle hover controls when sound is enabled.

### `src/demo.ts`

Provides sample dashboard data and an in-memory implementation of `PurrPauseApi` when opened by Vite without Electron. It is useful for visual work, but it does not simulate real idle detection, tray behavior, native drag, or disk persistence.

### `src/format.ts`

Small pure helpers for clock, duration, time-of-day, and reminder labels.

## 6. End-to-end reminder flow

1. `boot()` creates `StateStore`, windows, tray, and a one-second interval.
2. `tick()` reads system idle seconds using `powerMonitor.getSystemIdleTime()`.
3. If the user is active, `activeSecondsToday` and `currentSessionSeconds` increment.
4. `updateQuietState()` checks quiet hours and Windows smart quiet state.
5. `dueHealthyKinds()` compares active seconds with `runtime.nextDueByKind`.
6. Custom clock nudges and active-minute nudges are checked.
7. `triggerReminder()` creates `runtime.pendingReminder`, mood, and personalized message.
8. `save()` writes state and sends a snapshot to both windows.
9. `showMascot()` reveals the popup unless hidden/quiet; hidden mascot mode uses a Windows Notification instead.
10. React sees `pendingReminder`, selects the scenario pose, types the bubble, and renders Complete/Snooze.
11. Complete calls `purr:complete-reminder` → `startBreak()`; Snooze calls `purr:snooze-reminder`; dismiss calls `purr:dismiss-reminder`.
12. The action is recorded in history, the threshold is moved forward, `pendingReminder` becomes `null`, and the bubble disappears.
13. In always mode the cat remains visible in its ambient pose; in reminder-only mode it hides after the action/timer.

## 7. Run locally without installing

### Requirements

- Windows 10/11 for full tray, idle, notification-state, and installer behavior.
- Node.js 22+.
- pnpm 11. `corepack enable` can provision pnpm with modern Node.

### Install dependencies

```powershell
corepack enable
pnpm install
```

### Run the actual Electron desktop app

```powershell
pnpm dev
```

The Vite Electron plugin starts the renderer and Electron shell. The app runs from source, so edits to `src/`/`electron/` can be rebuilt or hot-reloaded depending on the changed file.

### Run the renderer-only browser preview

```powershell
pnpm dev:web
```

This uses `src/demo.ts` because `window.purrPause` is not present in a normal browser. It is good for dashboard styling and form work, but not for testing tray, Windows idle, transparent native windows, or drag persistence.

### Open a production-like local preview

```powershell
pnpm build
pnpm preview
```

`pnpm build` also prepares the Sites-compatible `dist/server/index.js` and `dist/.openai/hosting.json` files.

## 8. Test and validation workflow

Run these before committing a behavior change:

```powershell
pnpm typecheck
pnpm test
```

Run the full static/Sites validation:

```powershell
pnpm build
pnpm test:sites
```

`tests/scheduler.test.ts` is the main unit-test location. Add tests there for pure reminder/mood/quiet logic. Keep native Electron tests bounded and separate because tray/window APIs need a Windows process.

Line numbers will move as the project evolves, so use the stable function/file names in this guide and locate the current line with a search such as `rg -n "positionMascot|catAsset|DEFAULT_INTERVALS" electron src shared`.

For a native dashboard capture, set `PURRPAUSE_CAPTURE_PATH` and use the capture helper. For the newer mascot diagnostics, `electron/main.ts` also supports:

- `PURRPAUSE_MASCOT_CAPTURE_PATH`
- `PURRPAUSE_CAPTURE_IDLE=1`
- `PURRPAUSE_CAPTURE_SIZE=60`
- `PURRPAUSE_TEST_DRAG=1`
- `PURRPAUSE_TEST_USER_DATA=<temporary folder>`

Those hooks are for maintainers/QA and are not needed in normal use.

## 9. Common feature changes

### Change reminder intervals

For new-install defaults, edit `shared/defaults.ts`:

```ts
export const DEFAULT_INTERVALS = {
  eyes: 20,
  water: 45,
  stand: 50,
  walk: 90,
};
```

The Settings UI writes user overrides through `AppSettings.reminderIntervals`. Do not hard-code a second set of intervals in React.

### Add a new reminder kind

1. Add the string to `ReminderKind` in `shared/types.ts`.
2. Add its threshold if it is a healthy active-time reminder.
3. Add priority, label, message, and suggested duration in `electron/scheduler.ts`.
4. Add any `nextDueByKind` typing/default in `shared/defaults.ts`.
5. Add the UI card/icon in `RemindersView` and `kindIcon` in `src/App.tsx`.
6. Add pose mapping in `catAsset()`.
7. Add event/history handling if it needs special outcome behavior.
8. Add tests in `tests/scheduler.test.ts`.

For a simple workout reminder, prefer the existing Custom Nudge flow first. It already supports clock time or active interval and maps workout/movement titles to `cat-workout.png`.

### Add a new cat pose, for example “VR workout”

Recommended file convention:

```text
src/assets/mascot/cat-vr-workout.png          final RGBA asset
src/assets/mascot/cat-vr-workout-source.png   optional chroma-key source
```

Use a real transparent PNG/WebP, not a CSS drawing or a colored rectangle. Keep the same canvas size and calico art direction as the existing `cat-eyes.png`, `cat-stretch.png`, and `cat-workout.png`.

Integration steps:

1. Add the image file under `src/assets/mascot/`.
2. Import it near the other assets in `src/App.tsx`.
3. Add a deterministic rule in `catAsset(snapshot)`:

```ts
if (
  pending?.kinds.includes("custom") &&
  /vr|virtual reality/i.test(pending.title)
) {
  return catVrWorkout;
}
```

4. For a first-class reminder kind, follow the “Add a new reminder kind” steps instead.
5. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
6. Use a native mascot capture at 60% and verify alpha corners, no scrollbars, and no clipping.

If using the built-in image-generation workflow, generate on a flat chroma-key background, remove that key locally, inspect the alpha result, and commit only the final project asset plus a source asset if it is useful for future edits.

### Add another audio file or activity sound

The current app deliberately uses procedural audio in `src/catSounds.ts`, so it runs offline and has no extra binary audio files. To use real clips:

1. Place files under `src/assets/audio/`, for example:

```text
src/assets/audio/meow-soft.mp3
src/assets/audio/purr-soft.ogg
src/assets/audio/stretch-chime.mp3
```

2. Import them in a renderer module:

```ts
import stretchChimeUrl from "./assets/audio/stretch-chime.mp3";

const stretchChime = new Audio(stretchChimeUrl);
stretchChime.volume = 0.25;
stretchChime.play().catch(() => undefined);
```

3. Prefer a helper such as `playActivitySound(kind)` in `src/catSounds.ts` so the UI does not own audio policy.
4. Call it from the reminder transition in `MascotWindow`, based on `pending.kinds`.
5. Respect `settings.catSoundsEnabled`, `settings.soundEnabled`, reduced motion/quiet behavior, and the user’s volume expectations.
6. Keep clips short, compressed, and licensed for redistribution. Do not commit copyrighted sounds without permission.

The Electron main process adds `autoplay-policy=no-user-gesture-required`, but individual Windows audio devices or browser policies can still reject playback. Always catch `audio.play()` failures.

### Change the dashboard styling

Most styling changes belong in `src/styles.css`:

- Change palette tokens in `:root` and `:root[data-theme="dark"]`.
- Change typography in the global font declarations and `h1/h2` rules.
- Change dashboard geometry in `.app-shell`, `.today-grid`, `.sidebar`, `.main-canvas`.
- Change popup geometry in `.floating-mascot`, `.mascot-image`, `.speech-bubble`, `.mascot-actions`.
- Change motion in the mascot keyframes and the `data-motion="reduced"` rules.

Use existing Phosphor icons in `src/App.tsx` rather than drawing SVG icons manually. When changing a major visual region, capture the same state and update `design-qa.md`.

### Keep the cat above other windows

The existing implementation already does this in `electron/main.ts`:

```ts
mascotWindow.setAlwaysOnTop(true, "floating");
```

The user-facing switch is `settings.mascotMode === "always"`. To change the stacking level, edit the second argument to `setAlwaysOnTop`. Be careful: an always-on-top cat can cover presentations or full-screen apps, so keep smart quiet mode and the user toggle intact.

### Change mascot size, position, or drag behavior

- Type definitions: `MascotMode`, `MascotPosition`, and `AppSettings` in `shared/types.ts`.
- Defaults: `mascotSize`, `mascotPosition`, and `mascotCustomPosition` in `shared/defaults.ts`.
- Window dimensions/position: `positionMascot()` in `electron/main.ts`.
- Settings controls: `SettingsView()` in `src/App.tsx`.
- Native drag region: `.floating-mascot { -webkit-app-region: drag; }` in `src/styles.css`.
- Clickable exceptions: `.speech-bubble`, `.mascot-actions`, and `.mascot-close` use `-webkit-app-region: no-drag`.
- Persistence: the `move` listener in `createMascot()` writes `mascotCustomPosition` after a short debounce.

Do not call `positionMascot()` on every `tick()`. That was the cause of the earlier “moves, then jumps back” bug.

## 10. Persistence, backup, and uninstall

The live state file is `purrpause-state.json` under Electron’s `app.getPath("userData")`. The Settings “Save backup” action writes a portable JSON containing:

```json
{
  "format": "purrpause-backup",
  "version": 1,
  "exportedAt": "...",
  "data": {
    "settings": {},
    "runtime": {}
  }
}
```

Users should save this outside the installation folder before uninstalling. “Restore backup” reads it through the main process, validates it, merges defaults, restores history/preferences, and reapplies auto-launch.

If you add a persisted setting, update `AppSettings`, `createDefaultSettings()`, `StateStore.load()`, `StateStore.import()`, and the Settings UI. Add a migration when an old state needs a non-trivial conversion.

## 11. Package the Windows installer yourself

For a normal local build:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm build:desktop
```

The installer appears in `release/` as:

```text
PurrPause-Setup-<version>.exe
```

If the repository is inside a cloud-synced folder and electron-builder reports a permission, lock, or path-length error, copy the project to a short local path such as `C:\build\purrpause`, run the same checks/build there, and copy the resulting installer back to `release/`. Do not commit `dist/`, `dist-electron/`, or temporary unpacked output.

To release a new version:

1. Change `version` in `package.json`, for example `0.3.1`.
2. Run the checks above.
3. Run `pnpm build:desktop`.
4. Test the installer on a clean Windows user profile if possible.
5. Calculate a checksum:

```powershell
Get-FileHash .\release\PurrPause-Setup-0.3.1.exe -Algorithm SHA256
```

6. Commit the source and publish the installer/checksum through your chosen release channel.

The current `electron-builder` settings in `package.json` configure:

- App ID: `com.purrpause.desktop`.
- Product name: `PurrPause`.
- NSIS installer, non-one-click.
- User-selectable installation directory.
- Desktop and Start Menu shortcuts.
- Launch after install.
- `build/icon.png` copied to packaged `resources/assets/icon.png`.

Unsigned builds can trigger Windows SmartScreen. A public release should use a code-signing certificate and configure electron-builder signing credentials outside the repository.

## 12. App icon / favicon

The Windows app and tray icon source is:

```text
build/icon.png
```

Runtime selection is in `electron/main.ts` → `iconPath()`. Electron-builder copies it through the `extraResources` block in `package.json`.

The browser document shell is `index.html`. If you add a browser favicon, add an icon file under `src/assets/` or `public/` and add a `<link rel="icon" ...>` tag to `index.html`. For Windows installer/taskbar identity, update `build/icon.png` and rebuild the installer. Keep a square PNG with a transparent background; for polished Windows packaging you may also add an `.ico` through the electron-builder `win.icon` setting.

## 13. Safe change workflow

For a small change:

```powershell
git diff
pnpm typecheck
pnpm test
pnpm build
```

For a UI/mascot change:

1. Change source in `src/` or the relevant Electron module.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Run `pnpm build`.
5. Launch `pnpm dev` for dashboard work or use a bounded native Electron capture for mascot/window work.
6. Inspect the target state at normal size and 60% size.
7. Check light/dark mode, reduced motion, hidden mascot, quiet mode, and reminder action outcomes.
8. Update `design-qa.md` when the visual state or source comparison changes.
9. Package only after the source build and tests pass.

For a new feature, first update the shared type/default, then the main-process behavior, then preload IPC, then the React UI, then demo fallback/tests. This order prevents renderer controls from drifting away from the actual persisted behavior.

## 14. Troubleshooting

### `pnpm` tries to reinstall modules or says a tarball is unavailable

Run `pnpm install --frozen-lockfile` with network access. Do not edit `pnpm-lock.yaml` manually. The lockfile is the source of truth.

### Vite config reports `__dirname is not defined`

The current `vite.config.ts` intentionally uses `fileURLToPath(import.meta.url)` and `configDir` because the config is ESM and may be loaded through Vite’s runner.

### The dashboard works but native mascot behavior does not

You are probably using `pnpm dev:web`, which uses `src/demo.ts`. Use `pnpm dev` or a packaged/unpacked Electron build for tray, idle, smart quiet, native transparency, always-on-top, and drag behavior.

### Mascot appears with scrollbars or a background

Check that the mascot route has `?view=mascot`, that `html:has(body[data-view="mascot"])` removes the global minimum width, and that `catAsset()` points to an RGBA asset such as `cat-proud.png` rather than an older theme WebP.

### Cat moves and then jumps back

Check that `syncMascotWindow()` is not calling `positionMascot()` from the one-second tick. Only explicit settings changes/startup should pass `reposition=true`.

### No sound

Check Settings → Meows & purrs, Windows output volume, and that `AudioContext`/`HTMLAudioElement.play()` failures are caught. Confirm that the sound file is included in Vite output if you added a file asset.

### Smart quiet does not recognize Teams

This is expected when Teams does not set a Windows notification suppression state. Direct Teams presence requires Microsoft Graph authentication and permissions, which are intentionally outside this local-first app.

## 15. Recommended future improvements

- Add dedicated native Electron integration tests for pointer dragging and multi-monitor movement.
- Add a formal persisted-state schema/version migration test.
- Add a real audio asset policy and volume slider if procedural sounds are replaced.
- Add a Windows code-signing workflow for public releases.
- Add a small pose registry instead of expanding `catAsset()` conditionals as pose count grows.
- Add a user-selectable “never cover full-screen/presenting apps” policy if Windows notification-state heuristics need finer control.
