import { useState } from "react";
import { DayPicker, DayButton, TZDate, type DayButtonProps } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import { CalendarDays } from "lucide-react";
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { displayDate } from "../lib/market-format";

const dateAtUTC = (date: string) => new TZDate(date + "T12:00:00Z", "UTC");
const iso = (date: Date) => date.toISOString().slice(0, 10);
function PickerDay(props: DayButtonProps) {
  return <DayButton {...props} data-picker-date={iso(props.day.date)} />;
}

export default function DatePicker({ value, min, max, isSelectable, onSelect }: {
  value: string; min: string; max: string; isSelectable: (date: string) => boolean; onSelect: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => dateAtUTC(value));
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: (next) => { if (next) setMonth(dateAtUTC(value)); setOpen(next); },
    placement: "bottom-end", strategy: "fixed", whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  return <>
    <button type="button" className="date-picker-trigger" ref={refs.setReference} {...getReferenceProps({ "aria-label": "选择日历日期" })}>
      <span>{displayDate(value, true)}</span><CalendarDays size={14} aria-hidden="true" />
    </button>
    {open && <FloatingPortal><FloatingFocusManager context={context} modal={false} initialFocus={-1}>
      <div className="date-picker-popover" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps({ "aria-label": "选择交易日期" })}>
        <DayPicker className="date-picker-calendar" mode="single" required autoFocus timeZone="UTC" locale={zhCN} weekStartsOn={1}
          month={month} onMonthChange={setMonth} startMonth={dateAtUTC(min)} endMonth={dateAtUTC(max)}
          captionLayout="dropdown" navLayout="after" fixedWeeks showOutsideDays selected={dateAtUTC(value)}
          disabled={(date) => !isSelectable(iso(date))}
          labels={{ labelDayButton: (date) => displayDate(iso(date), true), labelMonthDropdown: () => "选择月份", labelYearDropdown: () => "选择年份", labelPrevious: () => "上个月", labelNext: () => "下个月" }}
          components={{ DayButton: PickerDay }}
          onSelect={(date) => { if (date && isSelectable(iso(date))) { onSelect(iso(date)); setOpen(false); } }} />
      </div>
    </FloatingFocusManager></FloatingPortal>}
  </>;
}
