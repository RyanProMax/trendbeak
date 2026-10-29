import { createContext, useContext, useMemo, useState, type CSSProperties } from "react";
import { DayPicker, DayButton, TZDate, type DayButtonProps } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import { autoUpdate, flip, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { CalendarDay, MarketSnapshot } from "../market-types";
import { displayDate, number } from "../lib/market-format";

const COLORS = ["#d5e6df", "#b8d6ca", "#94c0ae", "#72ab95", "#eef0ed", "#f3e1dc", "#e9c3b7", "#dba08d", "#ca816c"];
const iso = (date: Date) => date.toISOString().slice(0, 10);
const atUTC = (date: string) => new TZDate(date + "T12:00:00Z", "UTC");
function dayValue(day: CalendarDay) {
  return day.change !== null ? number(day.change, 2, true) + "%" : day.status === "closed" ? "休市" : "无交易数据";
}
function color(day: CalendarDay) {
  if (day.change === null || day.change === 0) return "#f3f4f3";
  const intensity = Math.abs(day.change) >= 3 ? 3 : Math.abs(day.change) >= 1.5 ? 2 : Math.abs(day.change) >= .5 ? 1 : 0;
  return day.change < 0 ? COLORS[intensity] : COLORS[5 + intensity];
}
const DaysContext = createContext<Map<string, CalendarDay>>(new Map());

function TradingDayButton(props: DayButtonProps) {
  const days = useContext(DaysContext);
  const date = iso(props.day.date);
  const day = days.get(date);
  const style: CSSProperties = day ? {
    ...props.style,
    background: color(day),
    ...(day.status === "missing" ? { background: "#fff", border: "1px dashed #b8c1bb" } : {}),
  } : props.style ?? {};
  return <DayButton {...props} className={`${props.className ?? ""} calendar-day`} data-date={day && !props.modifiers.outside ? date : undefined}
    data-status={day?.status} aria-disabled={props.disabled || undefined} style={style} />;
}

export default function YearCalendar({ snapshot, days, selectedDate, onSelectDate }: {
  snapshot: MarketSnapshot; days: CalendarDay[]; selectedDate: string; onSelectDate: (date: string) => void;
}) {
  const map = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const hoverDay = hoverDate ? map.get(hoverDate) : undefined;
  const start = atUTC(days[0].date), end = atUTC(days.at(-1)!.date);
  const firstMonth = new TZDate(start.getUTCFullYear(), start.getUTCMonth(), 1, "UTC");
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
  const { refs, floatingStyles, context } = useFloating({
    open: !!hoverDay, onOpenChange: (open) => { if (!open) setHoverDate(null); },
    placement: "top", strategy: "fixed",
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })], whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);
  const preview = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>("button[data-date]") : null;
    if (button) { refs.setReference(button); setHoverDate(button.dataset.date!); }
  };
  return <section className={`calendar-section${months > 12 ? " has-leading-fragment" : ""}`} aria-label={`${snapshot.instrument.name}过去一年每日涨跌`}
    onPointerOver={(event) => preview(event.target)} onPointerLeave={() => setHoverDate(null)}
    onFocusCapture={(event) => preview(event.target)} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverDate(null);
    }}>
    <DaysContext.Provider value={map}>
      <DayPicker className="market-calendar" mode="single" required timeZone="UTC" locale={zhCN} weekStartsOn={1}
        month={firstMonth} numberOfMonths={months} fixedWeeks hideNavigation disableNavigation
        startMonth={firstMonth} endMonth={end}
        selected={atUTC(selectedDate)}
        hidden={[{ before: start }, { after: end }]}
        disabled={(date) => map.get(iso(date))?.status === "closed"}
        onSelect={(date) => { if (date && map.get(iso(date))?.status !== "closed") onSelectDate(iso(date)); }}
        labels={{ labelDayButton: (date) => {
          const day = map.get(iso(date));
          return displayDate(iso(date), true) + (day ? "，" + dayValue(day) : "");
        } }}
        formatters={{ formatCaption: (month) => `${month.getUTCFullYear()} 年 ${month.getUTCMonth() + 1} 月` }}
        components={{ DayButton: TradingDayButton }} />
    </DaysContext.Provider>
    {hoverDay && <FloatingPortal><div className="compact-tooltip" role="tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <time dateTime={hoverDay.date}>{displayDate(hoverDay.date, true)}</time> · {dayValue(hoverDay)}
      {hoverDay.change !== null ? hoverDay.date === snapshot.asOf && snapshot.session === "trading" ? " · 盘中" : " · 收盘" : ""}
    </div></FloatingPortal>}
  </section>;
}

export function HeatLegend() {
  return <div className="heat-legend" aria-label="绿跌红涨；颜色越深幅度越大">
    <span className="down">跌</span><span className="swatches">{[...COLORS.slice(0, 4).reverse(), COLORS[4], ...COLORS.slice(5)].map((value) => <i key={value} style={{ background: value }} />)}</span><span className="up">涨</span>
    <span className="legend-missing"><i />休市 <i className="missing-swatch" />无交易数据</span>
  </div>;
}
