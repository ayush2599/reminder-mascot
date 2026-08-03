import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, PurrPauseApi } from "../shared/types";
import { demoApi } from "./demo";

export function usePurrPause() {
  const api = useMemo<PurrPauseApi>(() => window.purrPause ?? demoApi, []);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);

  useEffect(() => {
    let mounted = true;
    void api.getSnapshot().then((next) => mounted && setSnapshot(next));
    const unsubscribe = api.onSnapshot((next) => mounted && setSnapshot(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    if (!snapshot) return;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme =
      snapshot.settings.theme === "system"
        ? systemDark
          ? "dark"
          : "light"
        : snapshot.settings.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.motion =
      snapshot.settings.reducedMotion || !snapshot.settings.mascotAnimation ? "reduced" : "full";
  }, [snapshot]);

  return { api, snapshot };
}
