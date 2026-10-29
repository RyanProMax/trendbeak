import { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { MarketSnapshot, Signal } from "../market-types";
import { number, tone, displayDate } from "../lib/market-format";
import { sentimentState } from "../lib/chart-series";

export default function SignalMeter({
  signal,
  snapshot,
}: {
  signal: Signal;
  snapshot: MarketSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    strategy: "fixed",
    middleware: [offset(12), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    mouseOnly: true,
    delay: { open: 160, close: 80 },
    handleClose: safePolygon(),
  });
  const click = useClick(context, { stickIfOpen: true });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ]);
  const value = signal.value;
  const source = signal.source ?? snapshot.source;
  const position =
    value === null
      ? 50
      : Math.min(
          100,
          Math.max(0, ((value - signal.min) / (signal.max - signal.min)) * 100),
        );
  const difference =
    value !== null && signal.previous !== null ? value - signal.previous : null;
  const formatted = `${number(value, signal.digits, signal.id === "trend")}${value === null ? "" : signal.unit}`;
  const status = value === null ? "暂无数据" : signal.id === "sentiment" ? sentimentState(value)
    : signal.id === "rsi" ? value < 30 ? "超卖" : value > 70 ? "超买" : "中性"
    : signal.id === "trend" ? Math.abs(value) < .05 ? "贴近均线" : value < 0 ? "低于均线" : "高于均线"
    : signal.id === "volume" ? value < 1 ? "缩量" : value > 1 ? "放量" : "均量"
    : value < 20 ? "靠近低点" : value > 80 ? "靠近高点" : "区间中部";
  const labels = signal.id === "rsi" ? ["超卖 <30", "中性 30–70", "超买 >70"]
    : signal.id === "trend" ? ["低于均线", "0 · 贴近", "高于均线"]
    : signal.id === "volume" ? ["缩量 <1×", "均量 1×", "放量 >1×"]
    : signal.id === "range" ? ["0 · 一年低点", "", "100 · 一年高点"] : signal.labels;
  const ticks = signal.id === "rsi" ? [30, 70] : signal.id === "range" ? [] : [50];
  return (
    <article className="signal" data-signal={signal.id}>
      <button
        type="button"
        className="signal-trigger"
        ref={refs.setReference}
        {...getReferenceProps({
          "aria-label": `${signal.name} ${formatted}，查看说明`,
        })}
      >
        <span className="signal-top">
          <span className="signal-name">
            <strong>{signal.id === "trend" ? "MA20 偏离" : signal.id === "sentiment" ? "情绪" : signal.name}</strong>
            <small>{signal.id === "rsi" ? "14 日" : signal.id === "trend" || signal.id === "sentiment" ? "" : signal.period}</small>
          </span>
          <span className="signal-reading">
            <b>{value === null ? "暂无数据" : number(value, signal.digits, signal.id === "trend")}</b>
            {value !== null && <small>{signal.unit}</small>}
          </span>
        </span>
        <span
          className={`meter${value === null ? " unavailable" : ""}`}
          role="meter"
          aria-label={signal.name}
          aria-valuemin={signal.min}
          aria-valuemax={signal.max}
          aria-valuenow={
            value === null
              ? undefined
              : Math.max(signal.min, Math.min(signal.max, value))
          }
          aria-valuetext={value === null ? "暂无数据" : formatted}
        >
          {ticks.map((tick) => <span className="meter-tick" key={tick} style={{ left: `${tick}%` }} />)}
          {value !== null && (
            <span className="meter-marker" style={{ left: `${position}%` }} />
          )}
        </span>

      </button>
      {open && (
        <FloatingPortal>
          <div
            className="signal-tooltip"
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            <div className="tooltip-reading"><strong>{signal.name}</strong><b>{value === null ? "暂无数据" : formatted}</b></div>
            <p className="tooltip-status">{status}</p>
            <p>{signal.unavailable ?? signal.explanation}</p>
            <p className="tooltip-scale">{labels.filter(Boolean).join(" · ")}{signal.id === "trend" ? " · 显示区间 −10% 至 +10%" : ""}</p>
            {signal.note && <p className="signal-note">{signal.note}</p>}
            {!signal.unavailable && (
              <dl>
                <div>
                  <dt>{signal.previousLabel ?? "前一交易日"}</dt>
                  <dd>
                    {number(
                      signal.previous,
                      signal.digits,
                      signal.id === "trend",
                    )}
                    {signal.previous === null ? "" : signal.unit}
                  </dd>
                </div>
                <div>
                  <dt>变化</dt>
                  <dd className={tone(difference)}>
                    {number(difference, signal.digits, true)}
                    {difference === null
                      ? ""
                      : signal.unit === "%"
                        ? " 个百分点"
                        : signal.unit}
                  </dd>
                </div>
              </dl>
            )}
            <div className="tooltip-source">
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>
              <span>
                {displayDate(snapshot.asOf)}
                {snapshot.session === "trading" && signal.id !== "sentiment"
                  ? " · 盘中"
                  : ""}
              </span>
            </div>
          </div>
        </FloatingPortal>
      )}
    </article>
  );
}
