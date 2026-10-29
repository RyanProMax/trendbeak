# Stock Daily visual system

The interface follows the accepted V6 layout and V9 logo. White space, thin separators and tabular figures lead with real market values, the complete annual calendars, and five existing signals. The framework, data sources and indicator calculations are unchanged.

## Brand and color

The supplied wordmark uses five soft colors: green `#4F9D83`, sage `#8DB399`, gold `#C8BD83`, apricot `#D9A183`, coral `#CB7774`. `stock` follows the same gradient; `daily` remains gray lavender. The icon is five thin round-ended bars. Header, favicon, install icons and offline icon use these assets.

The canvas is `#fdfdfc`. Red means gains; green means losses. Emotion is a purple solid line and the benchmark a charcoal dashed line, identified by a shared legend. Technical meters use neutral rails and purple position markers. Self-hosted DM Sans Variable and Noto Sans SC Variable remain in place.

## Layout and dates

Two quote summaries precede one annual calendar section. A shares and US calendars share the same 365 calendar dates, month columns and return legend. Verified holidays stay disabled; missing trading-day returns remain outlined empty cells. The two grids wrap into matching groups on mobile, without horizontal swiping.

A shared date control updates both markets' quotes and available indicators. A market closed on that date shows no invented quote or indicator. Returning to latest restores each market's actual last session date independently. Session dates are shown once above the calendars; hovering previews details in a floating tooltip without moving the layout.

## Signals

A single 30/90 calendar-day control updates both charts on the same date axis. Emotion uses the left 0–100 scale, benchmark prices the right scale. Only dated observations are drawn; missing trading-day observations break the path. A lone CNN observation remains a point. Individual-stock selection changes its quote, calendar and technical readings while benchmark comparison continues to use the actual market index.

RSI retains Wilder 14-day values and explicit 30/70 thresholds. MA20 retains its −10% to +10% display range. Volume compares the selected complete day with the preceding 20 complete days, with 1× at the midpoint; unavailable values have no marker. The 52-week rail marks the one-year low and high and does not represent a historical percentile or trading recommendation. Sources, definitions and previous values remain in hover/focus/touch bubbles.

## Acceptance

Run `pnpm build`, `pnpm test`, `pnpm security:check` and `pnpm test:visual` with the local preview running. The browser scripts cover 1440px desktop and 390px mobile: full-page screenshots, every current/historical signal bubble, aligned calendars, shared dates, holidays, keyboard navigation, return to latest, real stock search/switching, long names, refresh failure, retry, search history and offline layout. Review screenshots in addition to automated overflow and console checks.
