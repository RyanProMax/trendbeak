import { useMemo } from "react";
import type { MarketSnapshot } from "../market-types";
import { latestSentiment } from "../lib/chart-series";
import { signalsForDate } from "../lib/market-signals";
import { displayDate } from "../lib/market-format";
import { sentimentColor } from "../lib/brand-palette";
import SignalMeter from "./SignalMeter";

/** A latest-observation headline; historical and hovered dates belong to the chart. */
export default function EmotionSummary({ snapshot }: { snapshot: MarketSnapshot }) {
  const observation = useMemo(() => latestSentiment(snapshot), [snapshot]);
  const date = observation?.date ?? snapshot.asOf;
  const dated = { ...snapshot, asOf: date, session: "closed" as const };
  return <div className="emotion-summary" data-observation-date={observation?.date ?? ""} style={observation ? { color: sentimentColor(observation.value) } : undefined}>
    <span className="emotion-observation-label">{observation ? <>最新情绪 · <time dateTime={date}>{displayDate(date)}</time></> : "情绪暂无观测"}</span>
    <SignalMeter signal={signalsForDate(snapshot, date)[0]} snapshot={dated} />
  </div>;
}
