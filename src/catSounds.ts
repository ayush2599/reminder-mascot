import meowFoodUrl from "./assets/audio/cat-meow-food.wav";
import meowPurrUrl from "./assets/audio/cat-meow-purr.wav";
import meowPurrTwoUrl from "./assets/audio/cat-meow-purr-2.wav";
import softMeowUrl from "./assets/audio/cat-meow-soft.wav";
import activePurrUrl from "./assets/audio/cat-purr-active.wav";
import sleepyPurrUrl from "./assets/audio/cat-purr-sleepy.wav";

export type CatSoundCue = "ambient" | "purr" | "reminder" | "grumpy";

const soundBank: Record<CatSoundCue, string[]> = {
  ambient: [softMeowUrl, meowPurrUrl, meowPurrTwoUrl],
  purr: [sleepyPurrUrl, activePurrUrl],
  reminder: [softMeowUrl, meowPurrUrl],
  grumpy: [meowFoodUrl, meowPurrTwoUrl],
};

let lastPlayedAt = 0;
let lastUrl = "";

function choose(cue: CatSoundCue): string {
  const choices = soundBank[cue];
  const alternatives = choices.filter((url) => url !== lastUrl);
  const selected = (alternatives.length ? alternatives : choices)[Math.floor(Math.random() * (alternatives.length ? alternatives.length : choices.length))];
  lastUrl = selected;
  return selected;
}

export function playCatSound(cue: CatSoundCue, volumePercent: number, force = false): void {
  const now = Date.now();
  if (!force && now - lastPlayedAt < 150_000) return;
  const audio = new Audio(choose(cue));
  audio.volume = Math.min(1, Math.max(0, volumePercent / 100));
  audio.addEventListener("ended", () => audio.remove());
  void audio.play().then(() => {
    lastPlayedAt = now;
  }).catch(() => audio.remove());
}
