# trendbeak visual system

White canvas, thin separators and tabular figures remain the foundation. UI accents derive from the approved five-bar logo: green, gray green, gold, apricot and coral. The existing wordmark and its gray-lavender `beak` stay unchanged. Small text uses darker related tones for legibility.

## Calendar and quotes

Keep the original annual return heatmap grouping, shared month axis, keyboard navigation and trading-day rules. The market name, instrument, point value, return and actual quote date now live in the left market area; mobile presents a compact header above each market grid. There are no standalone quote blocks at the top. A selected day updates these readings exactly; closed or missing sessions remain empty. The four-level return colors use softened green and coral from the same palette.

The calendar header contains only its title and the global selected date. Selection lives in the annual heatmap and trend chart; there is no separate date picker, adjacent-date control or latest button. The return scale and closed/missing keys share one centered, wrapping legend. Price dates remain per market: a common calendar selection is never used to pretend a market has a quote.

## Trend semantics and color

Default to 365 natural days. The shared navigator snaps to 30, 90, 180 and 365 days, with its right edge anchored to the latest benchmark session. Calendar selection and hover update cursors and exact-date readings, never the window, source paths or index domain. Out-of-window selection has a brief state.

Emotion color encodes its Y value, not elapsed time. The scale is flat green at 0–20, then continuously blends through gray green at 40, gold at 50 and apricot at 65, reaching coral at 80–100. A user-space vertical SVG gradient shares the fixed 0–100 scale; points and tooltip values use the same sRGB interpolation. This display scale does not change either source's scoring algorithm or verbal emotion categories. Benchmark prices use a distinguishable neutral solid line and a separate point-value axis.

Trend headers contain only the market name. Curve-end labels show numeric values only; their accessible names preserve the series, actual observation date and emotion category. Historical and hovered values belong to the date tooltip. Larger fixed-pixel axis labels, dates, legends and readouts share the calendar’s typography. Missing values stay missing; a lone CNN observation is a point, never a fabricated yearly line. Emotion is not gated by whether a price bar exists on that date.

## Motion and input

Monotone curves pass through real observations and preserve extrema. A fixed 365-day scene holds the original paths and trading-day gaps; range changes continuously transform the clipped viewport and price scale over 420 ms. No intermediate observations are synthesized, and hover does not recreate paths. Reduced motion makes the transform immediate.

Mouse clicks on the SVG interaction region have no default rectangular outline. Keyboard focus remains visible through a thin, rounded gradient stroke. Other controls keep their own focus styles. The search field rotates a small conic-gradient border layer only while hovered or focused, pauses while inactive, and is static under reduced motion.

## Signals and validation

Technical signals retain original units, calculations, a prominent value and quiet position rails. Thresholds, source, prior value and actual history remain in accessible hover/focus/touch bubbles. These are not six normalized emotion components.

Review full-page screenshots at 1440 and 390 px plus all current and historical signal bubbles. Verify exact-date linkage, holidays, search and failures, keyboard focus, touch scrolling, range snapping, missing data and reduced motion. Sample actual intermediate transforms to verify zoom continuity, stable paths and frame pacing; a fade alone is insufficient evidence of smooth range changes.
