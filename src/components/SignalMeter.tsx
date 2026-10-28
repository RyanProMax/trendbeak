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
            <strong>{signal.name}</strong>
            <small>{signal.period}</small>
          </span>
          <span className="signal-reading">
            <b>{number(value, signal.digits, signal.id === "trend")}</b>
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
          <span className="meter-center" />
          {value !== null && (
            <span className="meter-marker" style={{ left: `${position}%` }} />
          )}
        </span>
        <span className="meter-labels">
          {signal.labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
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
            <p>{signal.unavailable ?? signal.explanation}</p>
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
