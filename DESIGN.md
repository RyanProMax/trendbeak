# Stock Daily visual system

The interface leads with today's market values, one year of daily returns, and five signals. Both markets remain visible; stock search replaces the corresponding market card.

## Palette and typography

- Brand: a soft rainbow spectrum with a compact S mark; interactive accents use lavender `#7561b4`.
- Canvas: `#faf9fc` with subtle rose/lavender gradients; cards and floating details: white. Thin rainbow accents run along the header and card edges.
- Gains: coral/red. Losses: green. Heatmap intensity follows return magnitude.
- Meters: continuous green–neutral–red gradient; missing readings use a neutral track without a marker.
- Self-hosted DM Sans Variable and Noto Sans SC Variable.

`src/styles.css` is the authority for dimensions, colors and responsive behavior.

## Structure

A horizontally centered stock search sits in the header. The brand stays on the left. The header applies `padding-left: calc(100vw - 100%)` internally to balance native scrollbar width while its background and rainbow edge span the page.

Desktop shows A shares on the left and US markets on the right. At 760px and below, the cards stack in the same order. Calendar rows wrap to preserve readable cells; no horizontal swipe is needed inside a market card.

The one-year date range appears once above both markets. Each card keeps the date, session and daily return in a fixed-width pastel rainbow badge at the top right. Dates and session labels stay close together, and the same styling applies to current and historical dates. A return icon immediately to its left restores the latest date; its hover/focus bubble reads “返回最新日期”. The card's rainbow edge follows its rounded corners.

## Interaction

- The calendar uses `react-activity-calendar`. Hover previews a day's date, session and return in the card's top-right badge without moving or resizing it; leaving the calendar restores the selected date. The calendar footer contains only the color legend. Selecting a trading date changes the quote and all available indicators to that date. Selection uses a white fine border and a lavender halo; missing readings remain empty. Closed dates are disabled and show “休市” on hover, preserving the selected day's indicators.
- An instrument switch preserves the previous card until its matching name and data can be committed together. A short opacity transition and a thin loading line show progress without collapsing the card. Already visible markets do not force a page scroll.
- A day can also be selected by click or keyboard. Arrow keys skip closed days; focused dates have a soft halo.
- Indicator rows never expand. Floating UI positions explanations above or below the trigger and keeps them within the viewport. Hover, focus and touch share the same content; Escape and outside interaction dismiss it.
- Search supports keyboard navigation, loading/error/empty states and up to ten local recent selections.

## Content discipline

Only market information and necessary data-state copy belongs in the interface. No design-demo badge, repeated page description, internal provider identifier or implementation terminology. Dates are localized. Unknown readings stay unknown; partial intraday volume is not compared with complete historical days.

## Acceptance

Review full-page screenshots at 1440px and 390px, plus every indicator bubble and search state. Check page and component overflow, tooltip boundaries, keyboard/touch behavior, centering with scrollbars, and zero vertical movement while hovering calendar days. The automated entry point is `scripts/signal-visual-check.mjs`.
