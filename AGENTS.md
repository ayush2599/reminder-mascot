# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Approved product and visual direction

- This is a Windows-first Electron tray app, not only a browser prototype.
- The selected visual target is `design/reference-dashboard.png`.
- Preserve the cozy, cute, vibrant, Pinterest-inspired light theme, with an optional dark theme.
- The cat is a personalized companion: use the locally stored display name, adaptive moods, gentle motion, and short friendly dialogue.
- Core behavior includes active-time tracking, system idle detection, smart presentation/full-screen suppression, Pomodoro mode, configurable healthy reminders, and custom nudges.
- Reminders should be visible but non-intrusive, and the full app must remain usable when mascot animation or the mascot window is disabled.
- The floating companion should render directly on the desktop with a transparent, borderless window—never inside a visible rectangular app card.
- The companion supports an always-on-screen mode plus reminder-only mode. Its size and screen-edge position are user-configurable.
- Speech appears in a lightweight bubble with a typing animation; the cat uses scenario-specific postures for eye breaks, water, stretching, workouts, happy/neutral, and sleepy states.
- Ambient companion behavior should feel cat-like and subtle: gentle movement/rotation, blinking or smiling, occasional meow and purr sounds, with independent animation and sound controls.
- User preferences and reminder history must remain portable through an explicit local backup/export and restore/import workflow that can survive uninstall when the user keeps the backup file.
- Include a small developer credit for Ayush with a cute line and a link to https://github.com/ayush2599.
- In always-visible mode, the idle cat has no speech bubble or reminder actions. A bubble appears only for a pending reminder and disappears immediately after complete, snooze, or dismiss.
- Every mascot pose must use real alpha transparency at every configured size; the mascot window must never show horizontal or vertical scrollbars.
- Dragging is authoritative: a user-dragged position must not be overwritten by timer ticks or automatic corner positioning, and the final location must persist.
- Ambient cat sounds are enabled by default, remain user-controllable, and should occur occasionally rather than continuously.
- Today’s rhythm is an auditable wall-clock timeline. Never stretch recent segments to fill the chart or imply activity before the first recorded session.
- Idle, lock, suspend, sleep, and long timer gaps close the active focus session. Returning starts a new focus session, and ignored mascot reminders must not control activity counting.
- Rhythm states must remain distinguishable for red-green color-blind users through a blue/gray/amber/purple palette plus borders or patterns, not color alone.
- Mascot opacity is configurable from Settings and through a right-click control on the floating cat.
- Windows packages must stamp the PurrPause icon onto the executable; falling back to Electron’s default atom icon is a release blocker.
