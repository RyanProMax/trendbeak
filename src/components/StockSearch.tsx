import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Instrument } from "../market-types";
import { HISTORY_KEY, LEGACY_HISTORY_KEY, parseHistory, remember } from "../lib/search-history";

export default function StockSearch({
  onSelect,
}: {
  onSelect: (instrument: Instrument) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Instrument[]>([]);
  const [results, setResults] = useState<Instrument[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  const candidates = query.trim() ? results : history;
  const show = open && Boolean(query.trim() || history.length);
  useEffect(() => {
    try {
      const current = localStorage.getItem(HISTORY_KEY);
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      const saved = parseHistory(current ?? legacy);
      setHistory(saved);
      if (current === null && legacy !== null) localStorage.setItem(HISTORY_KEY, JSON.stringify(saved));
    } catch {}
  }, []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")
      ) {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") setOpen(false);
    };
    const away = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", down);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("pointerdown", away);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setError(false);
    setActive(0);
    if (!query.trim()) {
      setPending(false);
      return () => controller.abort();
    }
    setPending(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search unavailable");
        const payload = (await response.json()) as { data: Instrument[] };
        if (!controller.signal.aborted) setResults(payload.data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const choose = async (instrument: Instrument) => {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    if (await onSelect(instrument))
      setHistory((previous) => {
        const next = remember(previous, instrument);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
  };
  return (
    <div
      className="search-wrap"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div className={`search-field${show ? " is-open" : ""}`}>
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="搜索股票"
          aria-expanded={show}
          aria-controls={show ? id : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            show && candidates[active] ? `${id}-${active}` : undefined
          }
          placeholder="搜索股票名称或代码"
          autoComplete="off"
          maxLength={60}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                Math.min(current + 1, Math.max(0, candidates.length - 1)),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            }
            if (
              event.key === "Enter" &&
              show &&
              candidates[active] &&
              !pending
            ) {
              event.preventDefault();
              void choose(candidates[active]);
            }
          }}
        />
        {query ? (
          <button
            className="icon-button"
            aria-label="清空搜索"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </div>
      {show && (
        <div className="search-popover">
          {!query.trim() && (
            <div className="popover-heading">
              <span>最近搜索</span>
              <button
                onClick={() => {
                  setHistory([]);
                  try {
                    localStorage.removeItem(HISTORY_KEY);
                    localStorage.removeItem(LEGACY_HISTORY_KEY);
                  } catch {}
                }}
              >
                清空
              </button>
            </div>
          )}
          <div id={id} role="listbox" aria-label="股票搜索结果">
            {candidates.map((instrument, index) => (
              <button
                type="button"
                key={`${instrument.market}:${instrument.symbol}`}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`search-result${index === active ? " active" : ""}`}
                onPointerMove={() => setActive(index)}
                onClick={() => void choose(instrument)}
              >
                <span className="exchange">
                  {instrument.market === "CN" ? "A" : "US"}
                </span>
                <span className="result-name">
                  <strong>{instrument.name}</strong>
                  <small>{instrument.code}</small>
                </span>
              </button>
            ))}
          </div>
          {query.trim() && candidates.length === 0 && (
            <p className="empty-search" role="status">
              {pending
                ? "搜索中…"
                : error
                  ? "搜索暂不可用，请稍后重试"
                  : "未找到股票"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
