import type {
  AppSettings,
  CatMood,
  PendingReminder,
  ReminderKind,
  RuntimeState,
} from "../shared/types";

const kindPriority: ReminderKind[] = ["walk", "stand", "water", "eyes", "pomodoro", "custom"];

const kindLabel: Record<ReminderKind, string> = {
  eyes: "Eye break",
  water: "Water break",
  stand: "Stand & stretch",
  walk: "Movement break",
  custom: "Custom nudge",
  pomodoro: "Pomodoro complete",
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dueHealthyKinds(runtime: RuntimeState): ReminderKind[] {
  return kindPriority.filter((kind) => {
    if (kind === "custom" || kind === "pomodoro") return false;
    return runtime.activeSecondsToday >= runtime.nextDueByKind[kind];
  });
}

export function buildReminder(
  kinds: ReminderKind[],
  displayName: string,
  custom?: { title: string; message: string },
): PendingReminder {
  const ordered = [...new Set(kinds)].sort(
    (a, b) => kindPriority.indexOf(a) - kindPriority.indexOf(b),
  );
  const primary = ordered[0] ?? "stand";
  const name = displayName.trim() || "friend";
  const messages: Record<ReminderKind, string> = {
    eyes: `Hey ${name}, can we look somewhere far away for twenty seconds?`,
    water: `Hey ${name}, tiny water date with me?`,
    stand: `Hey ${name}, paws up — let’s stretch together.`,
    walk: `Hey ${name}, shall we take our legs for a little wander?`,
    pomodoro: `That focus round is tucked away, ${name}. Break time!`,
    custom: custom?.message || `Hey ${name}, your custom nudge is ready.`,
  };
  const title =
    ordered.length > 1
      ? `${kindLabel[primary]} + ${ordered.length - 1} gentle nudge${ordered.length > 2 ? "s" : ""}`
      : custom?.title || kindLabel[primary];

  return {
    id: crypto.randomUUID(),
    kinds: ordered,
    title,
    message: custom?.message || messages[primary],
    createdAt: new Date().toISOString(),
    suggestedBreakMinutes: primary === "walk" ? 7 : primary === "pomodoro" ? 5 : 2,
  };
}

export function nextDueAfterHandled(
  runtime: RuntimeState,
  settings: AppSettings,
  kinds: ReminderKind[],
): RuntimeState["nextDueByKind"] {
  const next = { ...runtime.nextDueByKind };
  for (const kind of kinds) {
    if (kind === "custom" || kind === "pomodoro") continue;
    next[kind] = runtime.activeSecondsToday + settings.reminderIntervals[kind] * 60;
  }
  return next;
}

export function isWithinQuietHours(now: Date, settings: AppSettings): boolean {
  if (!settings.quietHours.enabled) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const start = parse(settings.quietHours.start);
  const end = parse(settings.quietHours.end);
  if (start === end) return true;
  return start < end
    ? minutesNow >= start && minutesNow < end
    : minutesNow >= start || minutesNow < end;
}

export function computeMood(runtime: RuntimeState): CatMood {
  if (runtime.pauseReason === "break" || runtime.isIdle) return "sleepy";
  if (runtime.pendingReminder) return runtime.pendingReminder.kinds.includes("walk") ? "playful" : "concerned";
  if (runtime.breaksToday >= 3) return "proud";
  if (runtime.currentSessionSeconds >= 75 * 60) return "concerned";
  if (runtime.currentSessionSeconds < 10 * 60) return "content";
  return "playful";
}

export function messageForMood(mood: CatMood, name: string): string {
  const displayName = name.trim() || "friend";
  const messages: Record<CatMood, string> = {
    content: `All settled in, ${displayName}?`,
    proud: `You’re finding a lovely rhythm, ${displayName}.`,
    playful: `Tiny shoulder roll with me, ${displayName}?`,
    sleepy: `Rest counts too. I’ll keep watch, ${displayName}.`,
    concerned: `Hey ${displayName}, your body might like a little pause.`,
  };
  return messages[mood];
}

export function shouldTriggerClockNudge(
  now: Date,
  nudge: AppSettings["customNudges"][number],
): boolean {
  if (!nudge.enabled || nudge.scheduleType !== "time") return false;
  if (!nudge.days.includes(now.getDay())) return false;
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return current === nudge.time && nudge.lastTriggeredDate !== localDateKey(now);
}
