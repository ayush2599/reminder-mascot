import type { ReminderKind } from "../shared/types";

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export const reminderLabel: Record<ReminderKind, string> = {
  eyes: "Eye break",
  water: "Hydration",
  stand: "Stand & stretch",
  walk: "Walk around",
  custom: "Custom nudge",
  pomodoro: "Pomodoro",
};
