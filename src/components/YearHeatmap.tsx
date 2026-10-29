import { cloneElement, memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import { autoUpdate, flip, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { CalendarDay, MarketSnapshot } from "../market-types";
import { displayDate, number } from "../lib/market-format";

const COLORS = [
  "#126246",
  "#318267",
  "#73ae97",
  "#bdd8ca",
  "#eef0ed",
  "#f1cec3",
  "#e99985",
  "#d86a51",
  "#b74130",
];
function level(change: number | null) {
  if (change === null || change === 0) return 0;
  return (
    Math.sign(change) *
    (Math.abs(change) >= 3
      ? 4
      : Math.abs(change) >= 1.5
        ? 3
        : Math.abs(change) >= 0.5
          ? 2
          : 1)
  );
}
function dayValue(day: CalendarDay) {
  return day.change !== null
    ? `${number(day.change, 2, true)}%`
    : day.status === "closed"
      ? "休市"
      : "无交易数据";
}

function YearHeatmap({
  snapshot,
  selectedDate,
  days,
  showMonths = true,
  onSelectDate,
  onHoverDate,
}: {
  snapshot: MarketSnapshot;
  selectedDate: string;
  days: CalendarDay[];
  showMonths?: boolean;
  onSelectDate: (date: string) => void;
  onHoverDate?: (date: string | null) => void;
}) {
  const data = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        count: day.change ?? 0,
        level: level(day.change),
      })),
    [days],
  );
  const [width, setWidth] = useState(1000);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const hoverDay = data.find((day) => day.date === hoverDate);
  const focusDate = data.some((day) => day.date === selectedDate && day.status !== "closed") ? selectedDate : data.filter((day) => day.status !== "closed").at(-1)?.date;
  const closedTooltipId = useId();
  const showTooltip = !!hoverDay;
  const { refs, floatingStyles, context } = useFloating({
    open: showTooltip,
    onOpenChange: (open) => { if (!open) setHoverDate(null); },
    placement: "top", strategy: "fixed",
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const groupWeeks = width < 310 ? 14 : width < 680 ? 18 : 53;
  const startOffset =
    (new Date(`${data[0].date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const firstLength = groupWeeks * 7 - startOffset;
  const groups = [data.slice(0, firstLength)];
  for (let start = firstLength; start < data.length; start += groupWeeks * 7)
    groups.push(data.slice(start, start + groupWeeks * 7));
  const size = Math.floor(
    Math.min(20, Math.max(7, (width - 28 - (groupWeeks - 1) * 3) / groupWeeks)),
  );
  return (
    <section
      className="calendar-section"
      ref={container}
      aria-label={`${snapshot.instrument.name}过去一年每日涨跌`}
    >
      <div className="calendar-groups">
        {groups.map((group, index) => (
          <div className="calendar-half" key={index}>
            <ActivityCalendar
              data={group}
              minLevel={-4}
              maxLevel={4}
              theme={{ light: COLORS }}
              colorScheme="light"
              blockSize={size}
              blockMargin={3}
              blockRadius={2.5}
              fontSize={11}
              weekStart={1}
              showMonthLabels={showMonths || width < 680}
              showTotalCount={false}
              showColorLegend={false}
              showWeekdayLabels={["mon", "wed", "fri"]}
              labels={{
                months: [
                  "1月",
                  "2月",
                  "3月",
                  "4月",
                  "5月",
                  "6月",
                  "7月",
                  "8月",
                  "9月",
                  "10月",
                  "11月",
                  "12月",
                ],
                weekdays: ["日", "一", "二", "三", "四", "五", "六"],
              }}
              renderBlock={(block, activity) => {
                const day = data.find((item) => item.date === activity.date)!;
                const missing = day.change === null && day.status !== "closed";
                const closed = day.status === "closed";
                return cloneElement(block, {
                  role: "button",
                  tabIndex: !closed && day.date === focusDate ? 0 : -1,
                  "aria-label": `${displayDate(day.date, true)}，${dayValue(day)}`,
                  "aria-disabled": closed || undefined,
                  "aria-describedby": hoverDate === day.date ? closedTooltipId : undefined,
                  "aria-pressed": !closed && day.date === selectedDate,
                  fill: missing ? "#fff" : block.props.fill,
                  ...{"data-date": day.date},
                  style: {
                    ...block.props.style,
                    outline: "none",
                    stroke:
                      day.date === selectedDate
                        ? "#fff"
                        : missing
                          ? "#c3cbbb"
                          : "transparent",
                    strokeWidth: day.date === selectedDate ? 2 : 1,
                  },
                  strokeDasharray: missing ? "1.5 1.5" : undefined,
                  onClick: () => { if (!closed) onSelectDate(day.date); },
                  onMouseEnter: (event) => {
                    refs.setReference(event.currentTarget);
                    setHoverDate(day.date); onHoverDate?.(day.date);
                  },
                  onMouseLeave: () => { setHoverDate(null); onHoverDate?.(null); },
                  onFocus: (event) => { refs.setReference(event.currentTarget); setHoverDate(day.date); onHoverDate?.(day.date); },
                  onBlur: () => { setHoverDate(null); onHoverDate?.(null); },
                  onKeyDown: (event) => {
                    if (closed) return;
                    const jump = (
                      {
                        ArrowRight: 7,
                        ArrowLeft: -7,
                        ArrowDown: 1,
                        ArrowUp: -1,
                      } as Record<string, number>
                    )[event.key];
                    if (jump) {
                      event.preventDefault();
                      let nextIndex = Math.max(0, Math.min(data.length - 1, data.indexOf(day) + jump));
                      while (data[nextIndex]?.status === "closed") nextIndex += Math.sign(jump);
                      const next = data[nextIndex];
                      if (!next) return;
                      onSelectDate(next.date);
                      setHoverDate(next.date);
                      requestAnimationFrame(() =>
                        container.current
                          ?.querySelector<SVGElement>(
                            'rect[aria-pressed="true"]',
                          )
                          ?.focus(),
                      );
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectDate(day.date);
                    }
                  },
                });
              }}
            />
          </div>
        ))}
      </div>
      {showTooltip && hoverDay && (
        <FloatingPortal>
          <div id={closedTooltipId} role="tooltip" className={`compact-tooltip${hoverDay.status === "closed" ? " closed-tooltip" : ""}`}
            ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}><time dateTime={hoverDay.date}>{displayDate(hoverDay.date, true)}</time> · {dayValue(hoverDay)}{hoverDay.change !== null ? hoverDay.date === snapshot.asOf && snapshot.session === "trading" ? " · 盘中" : " · 收盘" : ""}</div>
        </FloatingPortal>
      )}
    </section>
  );
}

export default memo(YearHeatmap);

export function HeatLegend() {
  return <div className="heat-legend" aria-label="绿跌红涨；颜色越深幅度越大"><span className="down">−3%</span><span className="swatches">{COLORS.map((color) => <i key={color} style={{ background: color }} />)}</span><span className="up">+3%</span><span className="legend-missing"><i />休市 <i className="missing-swatch" />无交易数据</span></div>;
}
