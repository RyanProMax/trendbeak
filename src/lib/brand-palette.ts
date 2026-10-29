/** Logo-derived tones; emotion hue encodes score, never elapsed time. */
export const EMOTION_STOPS = [
  { value: 0, color: "#4f927d" },
  { value: 20, color: "#4f927d" },
  { value: 40, color: "#799780" },
  { value: 50, color: "#a49357" },
  { value: 65, color: "#bd896c" },
  { value: 80, color: "#bd6d60" },
  { value: 100, color: "#bd6d60" },
] as const;
export function sentimentColor(value: number): string {
  const score = Math.max(0, Math.min(100, value));
  const next = EMOTION_STOPS.findIndex((stop) => stop.value >= score);
  if (next <= 0) return EMOTION_STOPS[0].color;
  const a = EMOTION_STOPS[next - 1], b = EMOTION_STOPS[next];
  if (score === b.value) return b.color;
  const t = (score - a.value) / (b.value - a.value);
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgb(${rgb(a.color).map((channel, i) => Math.round(channel + (rgb(b.color)[i] - channel) * t)).join(", ")})`;
}
