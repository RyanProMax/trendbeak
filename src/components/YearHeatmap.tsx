import { cloneElement, memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import { autoUpdate, flip, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { CalendarDay, MarketSnapshot } from "../market-types";
import { displayDate, number } from "../lib/market-format";
import { calendarLayout, calendarIndexAt, calendarMonthLabels, CALENDAR_CELL, CALENDAR_GAP } from "../lib/calendar-layout";

const COLORS = [
  "#3e7e65",
  "#6ba18a",
  "#9bbca9",
  "#d1e0d5",
  "#eef0eb",
  "#f0dbd2",
  "#ddb1a1",
  "#cc8e7f",
  "#b96e63",
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
  const byDate = useMemo(()=>new Map(data.map(day=>[day.date,day])),[data]);
  const [width, setWidth] = useState(1000);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const hoverDay = data.find((day) => day.date === hoverDate);
  const focusDate = data.some((day) => day.date === selectedDate && day.status !== "closed") ? selectedDate : data.filter((day) => day.status !== "closed").at(-1)?.date;
  const closedTooltipId = useId();
  const showTooltip = !!hoverDay;
  const { refs, floatingStyles, context } = useFloating({
    open: showTooltip,
    onOpenChange: (open) => { if (!open) { inspected.current=null;setHoverDate(null);onHoverDate?.(null); } },
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
  const layout=calendarLayout(data[0].date,data.length,width),months=calendarMonthLabels(data.map(day=>day.date),layout);
  const grid=useRef<HTMLDivElement>(null),inspected=useRef<string|null>(null);
  const nearest=(event:{clientX:number;clientY:number})=>{
    const rect=grid.current!.getBoundingClientRect(),index=calendarIndexAt(event.clientX-rect.left,event.clientY-rect.top,layout);
    return index===null?null:data[index];
  };
  const inspect=(day:typeof data[number]|null)=>{
    const next=day?.date??null;if(inspected.current===next)return;
    inspected.current=next;
    if(day){const cell=grid.current?.querySelector<SVGRectElement>(`rect[data-date="${day.date}"]`);if(cell)refs.setReference(cell);}
    setHoverDate(day?.date??null);onHoverDate?.(day?.date??null);
  };
  const inspectPointer=(event:PointerEvent<HTMLDivElement>)=>inspect(nearest(event));
  return (
    <section
      className="calendar-section"
      ref={container}
      aria-label={`${snapshot.instrument.name}，${displayDate(data[0].date,true)}至${displayDate(data.at(-1)!.date,true)}每日涨跌`}
      data-start={data[0].date} data-end={data.at(-1)!.date} data-day-count={data.length} data-weeks={layout.weeks} style={{"--calendar-scale":layout.scale} as CSSProperties}
    >
      <div className="calendar-groups">
          <div className="calendar-months" aria-hidden="true">{(showMonths||width<680)&&months.map(month=><span key={month.x} style={{left:month.x}}>{month.label}</span>)}</div>
          <div className="calendar-weekdays" aria-hidden="true">{[0,2,4].map((row,i)=><span key={row} style={{top:row*23+10}}>{["一","三","五"][i]}</span>)}</div>
          <div className="calendar-half">
          <div className="calendar-grid-shell" ref={grid} onPointerMove={inspectPointer} onPointerDown={inspectPointer}
            onPointerLeave={()=>{if(!container.current?.querySelector(":focus-visible"))inspect(null);}}
            onClickCapture={event=>{if(event.detail===0)return;const day=nearest(event);event.stopPropagation();if(day&&day.status!=="closed")onSelectDate(day.date);}}>
            <ActivityCalendar
              data={data}
              minLevel={-4}
              maxLevel={4}
              theme={{ light: COLORS }}
              colorScheme="light"
              blockSize={CALENDAR_CELL}
              blockMargin={CALENDAR_GAP}
              blockRadius={2.5}
              fontSize={width < 680 ? 12 : 13}
              weekStart={1}
              showMonthLabels={false}
              showTotalCount={false}
              showColorLegend={false}
              showWeekdayLabels={false}
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
                const day = byDate.get(activity.date)!;
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
                  onFocus: () => inspect(day),
                  onBlur: () => inspect(null),
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
          </div>
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
  return <div className="heat-legend" aria-label="绿跌红涨；颜色越深幅度越大">
    <span className="heat-change-key"><span className="down">−3%</span><span className="swatches">{COLORS.map((color) => <i key={color} style={{ background: color }} />)}</span><span className="up">+3%</span></span>
    <span className="legend-missing"><span><i />休市</span><span><i className="missing-swatch" />无交易数据</span></span>
  </div>;
}
