import {COLORS,DARK_COLORS,level} from "../lib/heatmap-colors";
import {useEffect} from "react";
import {usePanelVisible} from "./CollapsiblePanel";
import { cloneElement, memo, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import "./calendar-range.css";
import { ActivityCalendar } from "react-activity-calendar";
import { autoUpdate, flip, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { CalendarDay, MarketSnapshot } from "../market-types";
import { displayDate, number } from "../lib/market-format";
import { calendarLayout, calendarIndexAt, calendarMonthLabels, CALENDAR_CELL, CALENDAR_GAP, weekdayIndex } from "../lib/calendar-layout";

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
  colorScheme = "light",
  onSelectDate,
  onHoverDate,
}: {
  snapshot: MarketSnapshot;
  selectedDate: string;
  days: CalendarDay[];
  showMonths?: boolean;
  colorScheme?: "light" | "dark";
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
  useLayoutEffect(() => {
    if (!container.current) return;
    // Measure before the first paint after a market remount, not one frame later.
    setWidth(container.current.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const layout=calendarLayout(data[0].date,data.length,width),months=calendarMonthLabels(data.map(day=>day.date),layout);
  const grid=useRef<HTMLDivElement>(null),inspected=useRef<string|null>(null);
  const nearest=(event:{clientX:number;clientY:number})=>{
    const rect=grid.current!.getBoundingClientRect(),index=calendarIndexAt(event.clientX-rect.left-3,event.clientY-rect.top-3,layout);
    return index===null?null:data[index];
  };
  const inspect=(day:typeof data[number]|null)=>{
    const next=day?.date??null;if(inspected.current===next)return;
    inspected.current=next;
    if(day){const cell=grid.current?.querySelector<SVGRectElement>(`rect[data-date="${day.date}"]`);if(cell)refs.setReference(cell);}
    setHoverDate(day?.date??null);onHoverDate?.(day?.date??null);
  };
  const panelVisible=usePanelVisible();
  useEffect(()=>{if(!panelVisible)inspect(null);},[panelVisible]);
  const inspectPointer=(event:PointerEvent<HTMLDivElement>)=>inspect(nearest(event));
  return (
    <section
      className="calendar-section"
      ref={container}
      aria-label={`${snapshot.instrument.name}，${displayDate(data[0].date,true)}至${displayDate(data.at(-1)!.date,true)}每日涨跌`}
      data-start={data[0].date} data-end={data.at(-1)!.date} data-day-count={data.length} data-weeks={layout.weeks} data-visible-day-count={data.filter(day=>weekdayIndex(day.date)<5).length} style={{"--calendar-scale":layout.scale,"--calendar-height":layout.gridHeight+"px","--calendar-svg-width":layout.logicalWidth+"px","--calendar-svg-height":(7*(CALENDAR_CELL+CALENDAR_GAP)-CALENDAR_GAP)+"px"} as CSSProperties}
    >
      <div className="calendar-groups">
          <div className="calendar-months" aria-hidden="true">{(showMonths||width<680)&&months.map(month=><span key={month.x} style={{left:month.x}}>{month.label}</span>)}</div>
          <div className="calendar-weekdays" aria-hidden="true">{(layout.scale<.35?[0,4]:[0,2,4]).map(row=><span key={row} style={{top:3+(row*23+10)*layout.scale}}>{["一","二","三","四","五"][row]}</span>)}</div>
          <div className="calendar-half">
          <div className="calendar-grid-shell" ref={grid} onPointerMove={inspectPointer} onPointerDown={inspectPointer}
            onPointerLeave={()=>{if(!container.current?.querySelector(":focus-visible"))inspect(null);}}
            onClickCapture={event=>{if(event.detail===0)return;const day=nearest(event);event.stopPropagation();if(day&&day.status!=="closed")onSelectDate(day.date);}}>
            <ActivityCalendar
              data={data.slice(layout.firstIndex,layout.lastIndex+1)}
              minLevel={-4}
              maxLevel={4}
              theme={{ light: COLORS, dark: DARK_COLORS }}
              colorScheme={colorScheme}
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
                if(weekdayIndex(activity.date)>4)return <g />;
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
                  fill: missing ? "var(--calendar-missing, #fff)" : block.props.fill,
                  ...{"data-date": day.date},
                  style: {
                    ...block.props.style,
                    outline: "none",
                    stroke:
                      day.date === selectedDate
                        ? "var(--calendar-selected, #fff)"
                        : missing
                          ? "var(--calendar-missing-stroke, #c3cbbb)"
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
          <div id={closedTooltipId} role="tooltip" className="compact-tooltip"
            ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}><time dateTime={hoverDay.date}>{displayDate(hoverDay.date, true)}</time> · {dayValue(hoverDay)}{hoverDay.change !== null ? hoverDay.date === snapshot.asOf && snapshot.session === "trading" ? " · 盘中" : " · 收盘" : ""}</div>
        </FloatingPortal>
      )}
    </section>
  );
}

export default memo(YearHeatmap);

export function HeatLegend({colorScheme="light"}:{colorScheme?:"light"|"dark"}={}) {
  return <div className="heat-legend" aria-label="绿跌红涨；颜色越深幅度越大">
    <span className="heat-change-key"><span className="down">−3%</span><span className="swatches">{(colorScheme==='dark'?DARK_COLORS:COLORS).map((color) => <i key={color} style={{ background: color }} />)}</span><span className="up">+3%</span></span>
  </div>;
}
