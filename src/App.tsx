import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowCounterClockwise,
  BellSimple,
  CalendarBlank,
  CaretRight,
  Cat as CatIcon,
  ChartBar,
  CheckCircle,
  Clock,
  Coffee,
  DownloadSimple,
  Drop,
  Eye,
  Gear,
  GithubLogo,
  Heart,
  House,
  Leaf,
  Monitor,
  Moon,
  Pause,
  PersonSimpleTaiChi,
  PersonSimpleWalk,
  Play,
  Plus,
  RocketLaunch,
  ShieldCheck,
  Sparkle,
  SpeakerHigh,
  Sun,
  Timer,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  CircularProgressbarWithChildren,
  buildStyles,
} from "react-circular-progressbar";
import type {
  AppSettings,
  AppSnapshot,
  CustomNudgeInput,
  ReminderKind,
  MascotPosition,
  ThemeMode,
} from "../shared/types";
import catActive from "./assets/mascot/cat-active.png";
import catProud from "./assets/mascot/cat-proud.png";
import catSleepy from "./assets/mascot/cat-sleepy.png";
import catEyes from "./assets/mascot/cat-eyes.png";
import catStretch from "./assets/mascot/cat-stretch.png";
import catWorkout from "./assets/mascot/cat-workout.png";
import { playSoftPurr, playTinyMeow } from "./catSounds";
import { formatClock, formatDuration, formatTime, reminderLabel } from "./format";
import { usePurrPause } from "./usePurrPause";

type View = "today" | "sessions" | "history" | "reminders" | "settings";

const navItems: { id: View; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <House weight="duotone" /> },
  { id: "sessions", label: "Sessions", icon: <Timer weight="duotone" /> },
  { id: "history", label: "History", icon: <ChartBar weight="duotone" /> },
  { id: "reminders", label: "Reminders", icon: <BellSimple weight="duotone" /> },
  { id: "settings", label: "Settings", icon: <Gear weight="duotone" /> },
];

const kindIcon: Record<ReminderKind, ReactNode> = {
  eyes: <Eye weight="duotone" />,
  water: <Drop weight="duotone" />,
  stand: <PersonSimpleTaiChi weight="duotone" />,
  walk: <PersonSimpleWalk weight="duotone" />,
  custom: <Sparkle weight="duotone" />,
  pomodoro: <Timer weight="duotone" />,
};

function catAsset(snapshot: AppSnapshot): string {
  const pending = snapshot.runtime.pendingReminder;
  if (pending?.kinds.includes("eyes")) return catEyes;
  if (pending?.kinds.includes("water")) return catActive;
  if (pending?.kinds.includes("stand")) return catStretch;
  if (
    pending?.kinds.includes("walk") ||
    (pending?.kinds.includes("custom") && /workout|exercise|move|walk/i.test(pending.title))
  ) {
    return catWorkout;
  }
  if (snapshot.runtime.mood === "sleepy") return catSleepy;
  return catProud;
}

function TypingBubble({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState("");
  useEffect(() => {
    setVisibleText("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 34);
    return () => window.clearInterval(timer);
  }, [text]);
  return <div className="speech-bubble is-typing">{visibleText}<span className="typing-caret" /></div>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function MascotScene({ snapshot, compact = false }: { snapshot: AppSnapshot; compact?: boolean }) {
  const moodLabel = {
    content: "Cozy",
    proud: "Proud of you",
    playful: "Playful",
    sleepy: "Keeping watch",
    concerned: "Checking in",
  }[snapshot.runtime.mood];
  return (
    <div className={`mascot-scene ${compact ? "is-compact" : ""}`}>
      {compact && snapshot.runtime.pendingReminder ? (
        <TypingBubble text={snapshot.runtime.mascotMessage} />
      ) : !compact ? (
        <div className="speech-bubble">{snapshot.runtime.mascotMessage}</div>
      ) : null}
      <img
        className="mascot-image"
        src={catAsset(snapshot)}
        alt={`Calico cat mascot feeling ${snapshot.runtime.mood}`}
      />
      {!compact && <span className="mood-chip">
        <Heart weight="fill" /> {moodLabel}
      </span>}
    </div>
  );
}

function MascotWindow({ snapshot }: { snapshot: AppSnapshot }) {
  const { api } = usePurrPause();
  const pending = snapshot.runtime.pendingReminder;
  const [gesture, setGesture] = useState("resting");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!snapshot.settings.mascotAnimation) return;
    const gestures = ["resting", "tilt", "bounce", "peek", "smile"];
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const next = gestures[Math.floor(Math.random() * gestures.length)];
        setGesture(next);
        if (
          snapshot.settings.catSoundsEnabled &&
          snapshot.settings.mascotMode === "always" &&
          Math.random() < 0.38
        ) {
          Math.random() < 0.58 ? playSoftPurr() : playTinyMeow();
        }
        schedule();
      }, 9000 + Math.random() * 13000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [
    snapshot.settings.catSoundsEnabled,
    snapshot.settings.mascotAnimation,
    snapshot.settings.mascotMode,
  ]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);
  return (
    <main
      className={`floating-mascot gesture-${gesture}`}
      aria-live="polite"
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 150)),
        });
      }}
    >
      <div className="mascot-visual-layer" style={{ opacity: snapshot.settings.mascotOpacity / 100 }}>
        <button className="mascot-close" aria-label="Hide mascot" onClick={() => void api.hideMascot()}>
          <X weight="bold" />
        </button>
        <MascotScene snapshot={snapshot} compact />
        {pending ? (
          <div className="mascot-actions">
            <button className="button primary small" onClick={() => void api.completeReminder()}>
              Let’s do it
            </button>
            <button className="button ghost small" onClick={() => void api.snoozeReminder()}>
              Snooze
            </button>
          </div>
        ) : (
          <div className="mascot-idle-actions">
            {snapshot.settings.catSoundsEnabled && (
              <button className="button ghost small" onClick={playTinyMeow}>Meow</button>
            )}
            <button className="button ghost small open-dashboard" onClick={() => void api.showDashboard()}>
              Open PurrPause
            </button>
          </div>
        )}
      </div>
      {contextMenu && (
        <div
          className="mascot-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label>
            <span>Cat opacity <strong>{snapshot.settings.mascotOpacity}%</strong></span>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={snapshot.settings.mascotOpacity}
              onChange={(event) => void api.updateSettings({ mascotOpacity: Number(event.target.value) })}
            />
          </label>
          <div>
            <button onClick={() => void api.showDashboard()}>Open PurrPause</button>
            <button onClick={() => void api.hideMascot()}>Hide cat</button>
          </div>
        </div>
      )}
    </main>
  );
}

function focusSessionCount(snapshot: AppSnapshot): number {
  return snapshot.runtime.rhythm.filter((segment) => segment.type === "focus" && segment.seconds >= 30).length;
}

function formatTimelineTime(milliseconds: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(milliseconds);
}

function Sidebar({
  snapshot,
  view,
  onView,
}: {
  snapshot: AppSnapshot;
  view: View;
  onView: (view: View) => void;
}) {
  const { api } = usePurrPause();
  const selectedTheme = snapshot.settings.theme === "dark" ? "dark" : "light";
  return (
    <aside className="sidebar">
      <div className="profile">
        <div className="avatar">
          <img src={catAsset(snapshot)} alt="" />
          <span />
        </div>
        <div>
          <strong>{snapshot.settings.displayName}</strong>
          <small>
            <Heart weight="fill" /> {snapshot.runtime.breaksToday >= 3 ? "Proud of you" : "Here with you"}
          </small>
        </div>
      </div>
      <nav aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            className={view === item.id ? "active" : ""}
            key={item.id}
            onClick={() => onView(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="theme-switch" aria-label="Color theme">
        <button
          className={selectedTheme === "light" ? "active" : ""}
          onClick={() => void api.updateSettings({ theme: "light" })}
        >
          <Sun weight="duotone" /> Light
        </button>
        <button
          className={selectedTheme === "dark" ? "active" : ""}
          onClick={() => void api.updateSettings({ theme: "dark" })}
        >
          <Moon weight="duotone" /> Dark
        </button>
      </div>
      <div className="sidebar-still-life" aria-hidden="true">
        <Leaf weight="duotone" />
        <Coffee weight="duotone" />
        <Sparkle weight="fill" />
      </div>
      <button
        className="developer-credit"
        onClick={() => void api.openExternal("https://github.com/ayush2599")}
        title="Open Ayush on GitHub"
      >
        <GithubLogo weight="fill" />
        <span>Made with tiny paws by Ayush</span>
      </button>
    </aside>
  );
}

function StatusBar({ snapshot }: { snapshot: AppSnapshot }) {
  const { api } = usePurrPause();
  return (
    <div className="status-bar">
      <button
        className="status-item"
        onClick={() => void api.updateSettings({ soundEnabled: !snapshot.settings.soundEnabled })}
      >
        <SpeakerHigh weight="duotone" />
        <span>Sounds</span>
        <strong>{snapshot.settings.soundEnabled ? "On" : "Off"}</strong>
      </button>
      <span className="status-divider" />
      <div className="status-item">
        <ShieldCheck weight="duotone" />
        <span>Smart quiet</span>
        <strong>{snapshot.runtime.quietReason ? snapshot.runtime.quietReason : "Monitoring"}</strong>
      </div>
      <span className="status-divider" />
      <div className="status-item">
        <CatIcon weight="duotone" />
        <span>Mascot</span>
        <strong>{snapshot.settings.mascotVisible ? "Visible" : "Hidden"}</strong>
      </div>
    </div>
  );
}

function Rhythm({ snapshot }: { snapshot: AppSnapshot }) {
  const nowMs = Date.now();
  const segments = snapshot.runtime.rhythm.filter((segment) => segment.seconds > 0);
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const eightAm = new Date(nowMs);
  eightAm.setHours(8, 0, 0, 0);
  const defaultStartMs = nowMs < eightAm.getTime() ? todayStart.getTime() : eightAm.getTime();
  const firstSegmentMs = segments.length
    ? Math.min(...segments.map((segment) => Date.parse(segment.startedAt)))
    : nowMs;
  const roundedFirstMs = new Date(firstSegmentMs).setMinutes(0, 0, 0);
  const timelineStartMs = Math.max(todayStart.getTime(), Math.min(defaultStartMs, roundedFirstMs));
  const timelineEndMs = Math.max(nowMs, timelineStartMs + 60 * 60_000);
  const timelineDurationMs = timelineEndMs - timelineStartMs;
  const sessions = focusSessionCount(snapshot);
  const heading = snapshot.runtime.isIdle
    ? "Away time is safely paused"
    : sessions > 1
      ? `${sessions} focused stretches today`
      : sessions === 1
        ? "Your first focused stretch"
        : "Ready when you are";
  const timelineLabels = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      label: index === 4 ? "Now" : formatTimelineTime(timelineStartMs + timelineDurationMs * ratio),
      left: `${ratio * 100}%`,
    };
  });
  return (
    <section className="rhythm-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Today’s rhythm</p>
          <h2>{heading}</h2>
        </div>
        <div className="legend" aria-label="Timeline legend">
          <span><i className="focus" /> Focus</span>
          <span><i className="idle" /> Away</span>
          <span><i className="shortBreak" /> Break</span>
          <span><i className="longBreak" /> Long break</span>
        </div>
      </div>
      <div className="rhythm-track" aria-label="Wall-clock timeline of today’s focus and away periods">
        {!segments.length && <span className="rhythm-empty">No active time recorded yet</span>}
        {segments.map((segment) => {
          const segmentStartMs = Math.max(timelineStartMs, Date.parse(segment.startedAt));
          const storedEndMs = segment.endedAt
            ? Date.parse(segment.endedAt)
            : Date.parse(segment.startedAt) + segment.seconds * 1000;
          const segmentEndMs = Math.min(timelineEndMs, Math.max(segmentStartMs, storedEndMs));
          const left = ((segmentStartMs - timelineStartMs) / timelineDurationMs) * 100;
          const width = ((segmentEndMs - segmentStartMs) / timelineDurationMs) * 100;
          const typeLabel = segment.type === "idle" ? "Away" : segment.type === "focus" ? "Focus" : "Break";
          const label = `${typeLabel}: ${formatTimelineTime(segmentStartMs)}–${formatTimelineTime(segmentEndMs)} (${formatDuration(segment.seconds)})`;
          return (
            <span
              key={segment.id}
              className={segment.type}
              style={{ left: `${left}%`, width: `${Math.max(0.25, width)}%` }}
              title={label}
              aria-label={label}
            />
          );
        })}
        <b className="now-marker" aria-hidden="true" />
      </div>
      <div className="rhythm-times" aria-hidden="true">
        {timelineLabels.map((item) => (
          <span key={`${item.left}-${item.label}`} style={{ left: item.left }}>{item.label}</span>
        ))}
      </div>
    </section>
  );
}

function TodayView({ snapshot, onCustom }: { snapshot: AppSnapshot; onCustom: () => void }) {
  const { api } = usePurrPause();
  const focusTarget =
    snapshot.settings.sessionMode === "pomodoro"
      ? snapshot.settings.pomodoroFocusMinutes * 60
      : Math.max(50 * 60, snapshot.settings.reminderIntervals.stand * 60);
  const elapsed =
    snapshot.settings.sessionMode === "pomodoro"
      ? focusTarget - snapshot.runtime.pomodoroSecondsRemaining
      : snapshot.runtime.currentSessionSeconds;
  const progress = Math.min(100, (elapsed / focusTarget) * 100);
  const timer =
    snapshot.settings.sessionMode === "pomodoro"
      ? snapshot.runtime.pomodoroSecondsRemaining
      : snapshot.runtime.currentSessionSeconds;
  const nextCustom = snapshot.settings.customNudges.find((nudge) => nudge.enabled);
  return (
    <div className="today-view">
      <header className="page-header">
        <div>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {snapshot.settings.displayName}!</h1>
          <p>{snapshot.runtime.isIdle ? "You’re away — active time is safely paused." : "You’re in focus. Keep the momentum gentle."}</p>
        </div>
        <div className="mode-and-date">
          <label className="mode-select">
            <Timer weight="duotone" />
            <select
              value={snapshot.settings.sessionMode}
              onChange={(event) =>
                void api.updateSettings({ sessionMode: event.target.value as AppSettings["sessionMode"] })
              }
            >
              <option value="balanced">Balanced rhythm</option>
              <option value="pomodoro">Focus · Pomodoro</option>
            </select>
          </label>
          <span className="date-label">
            <CalendarBlank weight="duotone" />
            {new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date())}
          </span>
        </div>
      </header>
      <div className="today-grid">
        <section className="focus-hero">
          <div className="focus-ring">
            <CircularProgressbarWithChildren
              value={progress}
              strokeWidth={5}
              styles={buildStyles({
                pathColor: "var(--sage)",
                trailColor: "var(--ring-track)",
                strokeLinecap: "round",
              })}
            >
              <span className="focus-label"><i /> {snapshot.runtime.paused ? "Paused" : "Focus session"}</span>
              <strong>{formatClock(timer)}</strong>
              <small>of {formatClock(focusTarget)}</small>
              <span className="deep-work"><Leaf weight="fill" /> Active time · idle-aware</span>
              <button className="button primary" onClick={() => void api.startBreak(5)}>
                <Coffee weight="duotone" /> Take a break
              </button>
              <button
                className="text-button"
                onClick={() => void api.setPaused(!snapshot.runtime.paused)}
              >
                {snapshot.runtime.paused ? <Play weight="fill" /> : <Pause weight="fill" />}
                {snapshot.runtime.paused ? "Resume tracking" : "Pause tracking"}
              </button>
            </CircularProgressbarWithChildren>
          </div>
          <Rhythm snapshot={snapshot} />
          <StatusBar snapshot={snapshot} />
        </section>
        <aside className="today-panel">
          <div className="today-summary">
            <div className="section-heading">
              <h2>Today</h2>
              <span>Details <CaretRight /></span>
            </div>
            <div className="metric-row">
              <div><Leaf weight="duotone" /><strong>{snapshot.runtime.breaksToday}</strong><span>Breaks taken</span></div>
              <div><Timer weight="duotone" /><strong>{focusSessionCount(snapshot)}</strong><span>Focus sessions</span></div>
              <div><Clock weight="duotone" /><strong>{formatDuration(snapshot.runtime.activeSecondsToday)}</strong><span>Focus time</span></div>
            </div>
          </div>
          <div className="recent-nudges">
            <h2>Recent nudges</h2>
            {snapshot.runtime.history.slice(0, 4).map((event) => (
              <div className="nudge-row" key={event.id}>
                <span className={`kind-icon ${event.kind}`}>{kindIcon[event.kind]}</span>
                <span><strong>{event.title}</strong><small>{formatTime(event.createdAt)}</small></span>
                <em>{event.outcome}</em>
              </div>
            ))}
            {!snapshot.runtime.history.length && <p className="empty-copy">Your completed nudges will gather here.</p>}
          </div>
          <div className="next-nudge">
            <p className="eyebrow">Next custom nudge</p>
            {nextCustom ? (
              <button className="nudge-card">
                <PersonSimpleTaiChi weight="duotone" />
                <span><strong>{nextCustom.title}</strong><small>{nextCustom.scheduleType === "time" ? `Today at ${nextCustom.time}` : `Every ${nextCustom.activeMinutes} active min`}</small></span>
                <CaretRight />
              </button>
            ) : (
              <p className="empty-copy">Nothing custom scheduled yet.</p>
            )}
            <button className="button secondary small" onClick={onCustom}><Plus weight="bold" /> Custom nudge</button>
          </div>
          {snapshot.settings.mascotVisible && <MascotScene snapshot={snapshot} />}
        </aside>
      </div>
    </div>
  );
}

function SessionsView({ snapshot }: { snapshot: AppSnapshot }) {
  const { api } = usePurrPause();
  const presets = [
    { name: "Tiny sprint", focus: 15, breakTime: 3, color: "butter" },
    { name: "Classic Pomodoro", focus: 25, breakTime: 5, color: "coral" },
    { name: "Deep cozy", focus: 50, breakTime: 10, color: "sage" },
  ];
  return (
    <section className="content-view">
      <header className="content-header"><div><p className="eyebrow">Sessions</p><h1>Choose your focus rhythm</h1><p>Use a structured Pomodoro or let PurrPause track a flexible workday.</p></div></header>
      <div className="preset-grid">
        {presets.map((preset) => (
          <button
            className={`preset-card ${preset.color}`}
            key={preset.name}
            onClick={() =>
              void api.updateSettings({
                sessionMode: "pomodoro",
                pomodoroFocusMinutes: preset.focus,
                pomodoroBreakMinutes: preset.breakTime,
              })
            }
          >
            <Timer weight="duotone" />
            <strong>{preset.name}</strong>
            <span>{preset.focus} min focus · {preset.breakTime} min rest</span>
            <em>{snapshot.settings.pomodoroFocusMinutes === preset.focus ? "Selected" : "Choose"}</em>
          </button>
        ))}
      </div>
      <div className="session-control-panel">
        <div>
          <p className="eyebrow">Current session</p>
          <strong className="giant-time">{formatClock(snapshot.runtime.currentSessionSeconds)}</strong>
          <span>{snapshot.runtime.paused ? "Paused" : "Active focus time"}</span>
        </div>
        <div className="button-row">
          <button className="button primary" onClick={() => void api.setPaused(!snapshot.runtime.paused)}>
            {snapshot.runtime.paused ? <Play weight="fill" /> : <Pause weight="fill" />}
            {snapshot.runtime.paused ? "Resume" : "Pause"}
          </button>
          <button className="button secondary" onClick={() => void api.resetSession()}>
            <ArrowCounterClockwise /> Reset
          </button>
        </div>
      </div>
    </section>
  );
}

function HistoryView({ snapshot }: { snapshot: AppSnapshot }) {
  const { api } = usePurrPause();
  return (
    <section className="content-view">
      <header className="content-header">
        <div><p className="eyebrow">History</p><h1>Your gentler workday</h1><p>A local record of nudges you took, snoozed, or dismissed.</p></div>
        <div className="button-row">
          <button className="button secondary small" onClick={() => void api.exportHistory()}><DownloadSimple /> Export</button>
          <button className="button ghost small danger" onClick={() => void api.clearHistory()}><Trash /> Clear</button>
        </div>
      </header>
      <div className="history-list">
        {snapshot.runtime.history.map((event) => (
          <article key={event.id}>
            <span className={`kind-icon ${event.kind}`}>{kindIcon[event.kind]}</span>
            <div><strong>{event.title}</strong><p>{event.message}</p></div>
            <time>{formatTime(event.createdAt)}</time>
            <em className={`outcome ${event.outcome}`}>{event.outcome}</em>
          </article>
        ))}
        {!snapshot.runtime.history.length && (
          <div className="empty-state"><CatIcon weight="duotone" /><h2>No nudges yet</h2><p>Your cat is waiting patiently for the first healthy pause.</p></div>
        )}
      </div>
    </section>
  );
}

function RemindersView({ snapshot, onCustom }: { snapshot: AppSnapshot; onCustom: () => void }) {
  const { api } = usePurrPause();
  const healthy = [
    { kind: "eyes" as const, title: "Rest your eyes", text: "Look at something far away" },
    { kind: "water" as const, title: "Drink water", text: "A tiny hydration check-in" },
    { kind: "stand" as const, title: "Stand & stretch", text: "Uncurl shoulders and paws" },
    { kind: "walk" as const, title: "Move your body", text: "A short wander around" },
  ];
  return (
    <section className="content-view">
      <header className="content-header"><div><p className="eyebrow">Reminders</p><h1>Build your nudge rhythm</h1><p>Intervals count only while you are actively using the computer.</p></div><button className="button primary small" onClick={onCustom}><Plus /> Add custom nudge</button></header>
      <div className="reminder-grid">
        {healthy.map((item) => (
          <article className={`reminder-card ${item.kind}`} key={item.kind}>
            <span className="kind-icon">{kindIcon[item.kind]}</span>
            <div><strong>{item.title}</strong><p>{item.text}</p></div>
            <label>
              Every
              <input
                type="number"
                min={5}
                max={240}
                value={snapshot.settings.reminderIntervals[item.kind]}
                onChange={(event) =>
                  void api.updateSettings({
                    reminderIntervals: {
                      ...snapshot.settings.reminderIntervals,
                      [item.kind]: Number(event.target.value),
                    },
                  })
                }
              />
              active min
            </label>
          </article>
        ))}
      </div>
      <div className="custom-list">
        <div className="section-heading"><div><p className="eyebrow">Custom</p><h2>Your own rituals</h2></div></div>
        {snapshot.settings.customNudges.map((nudge) => (
          <article key={nudge.id}>
            <Sparkle weight="duotone" />
            <div><strong>{nudge.title}</strong><p>{nudge.message}</p></div>
            <span>{nudge.scheduleType === "time" ? `${nudge.time} · selected days` : `Every ${nudge.activeMinutes} active min`}</span>
            <Toggle
              label={`Enable ${nudge.title}`}
              checked={nudge.enabled}
              onChange={(enabled) =>
                void api.updateSettings({
                  customNudges: snapshot.settings.customNudges.map((item) =>
                    item.id === nudge.id ? { ...item, enabled } : item,
                  ),
                })
              }
            />
            <button className="icon-button danger" aria-label={`Delete ${nudge.title}`} onClick={() => void api.deleteCustomNudge(nudge.id)}><Trash /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsView({ snapshot }: { snapshot: AppSnapshot }) {
  const { api } = usePurrPause();
  const patch = (next: Partial<AppSettings>) => void api.updateSettings(next);
  const themeOptions: { value: ThemeMode; label: string; icon: ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun /> },
    { value: "dark", label: "Dark", icon: <Moon /> },
    { value: "system", label: "System", icon: <Monitor /> },
  ];
  const positionOptions: { value: MascotPosition; label: string }[] = [
    { value: "bottom-right", label: "Bottom right" },
    { value: "bottom-left", label: "Bottom left" },
    { value: "top-right", label: "Top right" },
    { value: "top-left", label: "Top left" },
  ];
  return (
    <section className="content-view">
      <header className="content-header"><div><p className="eyebrow">Settings</p><h1>Make PurrPause yours</h1><p>Everything stays on this computer.</p></div></header>
      <div className="settings-sections">
        <section>
          <div className="settings-icon coral"><CatIcon weight="duotone" /></div>
          <div className="settings-copy"><h2>Your companion</h2><p>Choose how your cat knows and appears for you.</p></div>
          <div className="settings-controls">
            <label className="field"><span>Your name</span><input value={snapshot.settings.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></label>
            <SettingRow title="Show floating mascot" text="The dashboard still works when hidden"><Toggle label="Show floating mascot" checked={snapshot.settings.mascotVisible} onChange={(value) => patch({ mascotVisible: value })} /></SettingRow>
            <label className="field">
              <span>When the cat appears</span>
              <select value={snapshot.settings.mascotMode} onChange={(event) => patch({ mascotMode: event.target.value as AppSettings["mascotMode"] })}>
                <option value="reminders">Only for reminders</option>
                <option value="always">Stay on my screen</option>
              </select>
            </label>
            <label className="field">
              <span>Desktop position</span>
              <select value={snapshot.settings.mascotPosition} onChange={(event) => patch({ mascotPosition: event.target.value as MascotPosition })}>
                {positionOptions.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}
              </select>
            </label>
            <label className="field range-field">
              <span>Cat size <strong>{snapshot.settings.mascotSize}%</strong></span>
              <input type="range" min="60" max="160" step="10" value={snapshot.settings.mascotSize} onChange={(event) => patch({ mascotSize: Number(event.target.value) })} />
            </label>
            <label className="field range-field">
              <span>Cat opacity <strong>{snapshot.settings.mascotOpacity}%</strong></span>
              <input type="range" min="20" max="100" step="5" value={snapshot.settings.mascotOpacity} onChange={(event) => patch({ mascotOpacity: Number(event.target.value) })} />
              <small>Right-click the floating cat to adjust this without opening the dashboard.</small>
            </label>
            <SettingRow title="Gentle animations" text="Tiny stretches, bobs, and blinks"><Toggle label="Mascot animation" checked={snapshot.settings.mascotAnimation} onChange={(value) => patch({ mascotAnimation: value })} /></SettingRow>
            <SettingRow title="Meows & purrs" text="Occasional soft cat sounds; on by default"><Toggle label="Cat sounds" checked={snapshot.settings.catSoundsEnabled} onChange={(value) => patch({ catSoundsEnabled: value })} /></SettingRow>
          </div>
        </section>
        <section>
          <div className="settings-icon sage"><RocketLaunch weight="duotone" /></div>
          <div className="settings-copy"><h2>Desktop behavior</h2><p>Tray, startup, and interruption controls.</p></div>
          <div className="settings-controls">
            <SettingRow title="Start with Windows" text="Enabled by default after installation"><Toggle label="Start with Windows" checked={snapshot.settings.autoLaunch} onChange={(value) => patch({ autoLaunch: value })} /></SettingRow>
            <SettingRow title="Smart quiet mode" text="Delay popups during presentations, full-screen, busy, and DND states"><Toggle label="Smart quiet mode" checked={snapshot.settings.smartQuietEnabled} onChange={(value) => patch({ smartQuietEnabled: value })} /></SettingRow>
            <SettingRow title="Reminder sound" text="A tiny optional chime"><Toggle label="Reminder sound" checked={snapshot.settings.soundEnabled} onChange={(value) => patch({ soundEnabled: value })} /></SettingRow>
          </div>
        </section>
        <section>
          <div className="settings-icon butter"><Sun weight="duotone" /></div>
          <div className="settings-copy"><h2>Appearance</h2><p>Cute in daylight, cozy after dark.</p></div>
          <div className="settings-controls">
            <div className="theme-cards">
              {themeOptions.map((theme) => (
                <button className={snapshot.settings.theme === theme.value ? "active" : ""} key={theme.value} onClick={() => patch({ theme: theme.value })}>{theme.icon}<span>{theme.label}</span></button>
              ))}
            </div>
            <SettingRow title="Reduce all motion" text="Also follows your explicit preference"><Toggle label="Reduce motion" checked={snapshot.settings.reducedMotion} onChange={(value) => patch({ reducedMotion: value })} /></SettingRow>
          </div>
        </section>
        <section>
          <div className="settings-icon coral"><DownloadSimple weight="duotone" /></div>
          <div className="settings-copy"><h2>Your data</h2><p>Keep preferences and history portable across installs.</p></div>
          <div className="settings-controls">
            <p className="portable-copy">PurrPause stores everything locally. Save a backup somewhere you control before uninstalling, then restore that file after reinstalling.</p>
            <div className="button-row">
              <button className="button secondary small" onClick={() => void api.exportBackup()}><DownloadSimple /> Save backup</button>
              <button className="button ghost small" onClick={() => void api.importBackup()}><UploadSimple /> Restore backup</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingRow({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{text}</span></div>{children}</div>;
}

function CustomNudgeModal({ onClose }: { onClose: () => void }) {
  const { api } = usePurrPause();
  const [form, setForm] = useState<CustomNudgeInput>({
    title: "Workout",
    message: "Hey, time for a little movement date!",
    scheduleType: "time",
    time: "18:30",
    days: [1, 2, 3, 4, 5],
    activeMinutes: 90,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void api.addCustomNudge(form).then(onClose);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <button type="button" className="modal-close icon-button" aria-label="Close" onClick={onClose}><X /></button>
        <div className="modal-art"><Sparkle weight="duotone" /></div>
        <p className="eyebrow">Custom nudge</p>
        <h2>What should your cat remember?</h2>
        <label className="field"><span>Name</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="field"><span>What the cat says</span><input required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
        <div className="segment-control">
          <button type="button" className={form.scheduleType === "time" ? "active" : ""} onClick={() => setForm({ ...form, scheduleType: "time" })}><Clock /> Clock time</button>
          <button type="button" className={form.scheduleType === "active" ? "active" : ""} onClick={() => setForm({ ...form, scheduleType: "active" })}><Timer /> Active interval</button>
        </div>
        {form.scheduleType === "time" ? (
          <label className="field"><span>Time</span><input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
        ) : (
          <label className="field"><span>Every active minutes</span><input type="number" min={10} value={form.activeMinutes} onChange={(event) => setForm({ ...form, activeMinutes: Number(event.target.value) })} /></label>
        )}
        <button className="button primary" type="submit"><Plus weight="bold" /> Add this nudge</button>
      </form>
    </div>
  );
}

function Dashboard({ snapshot }: { snapshot: AppSnapshot }) {
  const [view, setView] = useState<View>("today");
  const [customOpen, setCustomOpen] = useState(false);
  return (
    <main className="app-shell">
      <Sidebar snapshot={snapshot} view={view} onView={setView} />
      <div className="main-canvas">
        {view === "today" && <TodayView snapshot={snapshot} onCustom={() => setCustomOpen(true)} />}
        {view === "sessions" && <SessionsView snapshot={snapshot} />}
        {view === "history" && <HistoryView snapshot={snapshot} />}
        {view === "reminders" && <RemindersView snapshot={snapshot} onCustom={() => setCustomOpen(true)} />}
        {view === "settings" && <SettingsView snapshot={snapshot} />}
      </div>
      {customOpen && <CustomNudgeModal onClose={() => setCustomOpen(false)} />}
    </main>
  );
}

export function App() {
  const { snapshot } = usePurrPause();
  const view = useMemo(() => new URLSearchParams(window.location.search).get("view"), []);
  useEffect(() => {
    document.body.dataset.view = view === "mascot" ? "mascot" : "dashboard";
    return () => {
      delete document.body.dataset.view;
    };
  }, [view]);
  if (!snapshot) return <div className="loading"><CatIcon weight="duotone" /><span>Waking your cat…</span></div>;
  return view === "mascot" ? <MascotWindow snapshot={snapshot} /> : <Dashboard snapshot={snapshot} />;
}
