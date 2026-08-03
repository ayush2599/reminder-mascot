# PurrPause 0.3.0 Design QA

**Source and evidence**

- Reported failure: `C:\Users\karn\AppData\Local\Temp\codex-clipboard-c87deec9-5eb5-48bf-9e8e-3e3b1780fab4.png` (1919 × 1199 px).
- Idle implementation: `design/implementation-mascot-v030-small-idle.png`.
- Reminder implementation: `design/implementation-mascot-v030-small-reminder-final.png`.
- Combined comparison: `design/mascot-v030-qa-comparison.png`.
- Native CSS viewport: 252 × 216 px, representing the minimum 60% mascot size at Windows device scale factor 1.5.

**Findings**

- No remaining P0/P1/P2 issues.
- Typography: reminder copy is complete, readable, and contained at the minimum size.
- Layout: native metrics report `clientWidth === scrollWidth` and `clientHeight === scrollHeight` for both `html` and `body`; no scrollbar or hidden overflow is present.
- Colors: the warm bubble and coral action preserve the approved visual system.
- Image quality: idle and reminder poses use alpha PNG assets. The checkerboard comparison confirms that no light or dark rectangle is baked into either pose.
- Content: idle bubble count is `0`; reminder bubble count is `1`. Complete and Snooze remain visible only for a pending reminder.
- Interaction: the full mascot surface is a native drag region, controls are excluded from dragging, and the automated movement check reports `dragPersisted: true` after a tracking tick.
- Sound: occasional meow and purr synthesis is enabled by default for upgraded and fresh settings, with a user-facing toggle.

**Comparison history**

- P1 fixed: legacy sleepy/normal theme images contained visible backgrounds. All runtime poses now use real-alpha PNGs.
- P1 fixed: global 320 px page minimum produced scrollbars below 77% size. Mascot `html`, `body`, and `#root` now use the exact window viewport with overflow disabled.
- P1 fixed: tick-driven `positionMascot()` calls overrode dragging. Timer synchronization no longer repositions an existing mascot; only an explicit corner/size change does.
- P2 fixed: idle text stayed on screen. The compact bubble now renders only while `pendingReminder` exists and disappears after complete, snooze, or dismiss.
- P2 fixed: minimum-size actions were visually heavy. A compact 60% layout reduces bubble padding, cat footprint, button height, and action spacing.

**Residual manual check**

- Physical pointer feel varies slightly by Windows scaling and pointing device. Native move persistence and tick-race behavior are covered, but a short user drag remains the best final feel check.

final result: passed
