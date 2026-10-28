import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  autoUpdate, flip, FloatingPortal, offset, shift, useDismiss,
  useFloating, useFocus, useHover, useInteractions, useRole,
} from "@floating-ui/react";

export default function LatestDateButton({ onClick }: { onClick: () => void }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: "top", strategy: "fixed",
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { mouseOnly: true, delay: 120 });
  const focus = useFocus(context, { visibleOnly: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover, focus, dismiss, role,
  ]);
  return (
    <>
      <button
        type="button"
        className="latest-date-button"
        ref={refs.setReference}
        {...getReferenceProps({ "aria-label": "返回最新日期", onClick })}
      >
        <RotateCcw size={15} aria-hidden="true" />
      </button>
      {open && (
        <FloatingPortal>
          <div className="compact-tooltip" ref={refs.setFloating}
            style={floatingStyles} {...getFloatingProps()}>
            返回最新日期
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
