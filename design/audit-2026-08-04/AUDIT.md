# Dashboard and mascot audit — 2026-08-04

## Scope

Combined UX and accessibility review of the reported Today screen, the revised rhythm timeline, and the new mascot opacity control.

## User goal

Understand when work actually happened, trust that away time is excluded, distinguish states with mild red-green color blindness, and reduce or hide the floating cat without opening the full dashboard.

## Steps

1. **Reported Today screen — needs correction.** The timeline used fixed labels but stretched the last twelve recorded states across the full width, so the blocks did not correspond to their wall-clock timestamps. The focus color and empty state were also too dependent on green versus a pale background. Evidence: `01-reported-dashboard.png`.
2. **Revised Today screen — healthy.** Segments are positioned by timestamp; empty time stays empty; focus, away, break, and long-break states use blue, gray/dashes, amber/stripes, and purple/dots. The synthetic rhythm score was replaced with a count of real focus sessions. Evidence: `02-updated-dashboard.png` and final native capture `05-native-dashboard.png`.
3. **Mascot context control — healthy.** Right-click reveals a compact opacity slider plus open/hide actions. The menu remains fully opaque while the cat can be reduced to 20%. Evidence: `03-opacity-menu-browser.png`.
4. **Packaged application identity — healthy.** The unpacked 0.4.0 application launched successfully, and the icon extracted from `PurrPause.exe` is the cat artwork rather than Electron’s default atom. Evidence: `04-packaged-exe-icon.png` and `05-native-dashboard.png`.

## Strengths

- The revised timeline answers “when did I work?” without making the user infer a normalized chart.
- Color, border, and pattern now carry state together.
- Opacity is available in context and in Settings, using one persisted value.
- The cat remains optional; tracking and dashboard features do not depend on it.

## Remaining risks and evidence limits

- Screenshots cannot prove color-contrast ratios, keyboard behavior, real Windows sleep duration, or Windows Explorer icon-cache refresh after an upgrade.
- The browser mascot capture shows a white page background because browsers do not composite a transparent window onto the desktop; packaged Electron testing remains the authority for that behavior.
- Direct Teams presence is not available without Microsoft Graph permissions; smart quiet remains best-effort through Windows notification state.

## Recommendation

Keep activity tracking in timestamped segments and add future native integration tests for lock/suspend/resume and multi-monitor mascot behavior. Do not return to normalized recent-segment timelines for a view labeled “Today.”
