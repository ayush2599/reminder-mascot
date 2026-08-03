function audioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

export function playTinyMeow(): void {
  const context = audioContext();
  if (!context) return;
  const now = context.currentTime;
  const gain = context.createGain();
  const voice = context.createOscillator();
  const warmth = context.createOscillator();
  const filter = context.createBiquadFilter();

  voice.type = "triangle";
  warmth.type = "sine";
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  voice.frequency.setValueAtTime(480, now);
  voice.frequency.exponentialRampToValueAtTime(690, now + 0.12);
  voice.frequency.exponentialRampToValueAtTime(310, now + 0.52);
  warmth.frequency.setValueAtTime(240, now);
  warmth.frequency.exponentialRampToValueAtTime(155, now + 0.52);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);

  voice.connect(filter);
  warmth.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  voice.start(now);
  warmth.start(now);
  voice.stop(now + 0.6);
  warmth.stop(now + 0.6);
  window.setTimeout(() => void context.close(), 800);
}

export function playSoftPurr(): void {
  const context = audioContext();
  if (!context) return;
  const now = context.currentTime;
  const carrier = context.createOscillator();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  carrier.type = "sawtooth";
  carrier.frequency.value = 58;
  lfo.type = "sine";
  lfo.frequency.value = 24;
  lfoGain.gain.value = 0.012;
  filter.type = "lowpass";
  filter.frequency.value = 155;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.022, now + 0.16);
  gain.gain.setValueAtTime(0.022, now + 1.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);

  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  carrier.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  carrier.start(now);
  lfo.start(now);
  carrier.stop(now + 1.4);
  lfo.stop(now + 1.4);
  window.setTimeout(() => void context.close(), 1600);
}
