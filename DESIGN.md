# trendbeak visual system

White canvas, thin separators, tabular figures and the approved five-bar icon remain the visual foundation. The lowercase wordmark uses a muted green-to-coral gradient for `trend` and gray lavender for `beak`. Font outlines are generated from the existing DM Sans font, so the SVG is portable and independent of installed fonts.

## Calendar

The annual return heatmap and its responsive grouping, shared month axis, color scale, date selection and previews are restored directly from commit 1ffc080. This is independent of the date selection popover.

Only the native date-input popup is replaced with DayPicker 10.0.2. Its small floating panel uses the existing lavender accent, rounded days, month/year navigation and keyboard focus. Escape and outside press dismiss it; selecting a permitted trading date updates both markets and returns focus to the trigger. Dates use UTC calendar labels, and the same existing trading-day predicate controls disabled dates.

## Signals

A shared miniature navigator snaps its left edge to 30, 90, 180 and 365 natural-day windows; the latest available benchmark date fixes the right edge. Dragging, touch, four small stop buttons and keyboard arrows/Home/End provide equivalent control. Vertical touch scrolling does not change the range. Emotion and benchmark prices keep separate axes and shared line semantics. Calendar selection and chart inspection update only cursors and exact-date readings, never the paths or index domains. Out-of-window selection has a short explicit state. Hover, focus and touch show a clamped date tooltip; chart selection updates the calendar. Legend buttons toggle each line and its scale. Monotone display curves pass through real observations without extra extrema; missing trading observations split paths. A short range-change fade respects reduced motion and does not restart on hover. No observations are invented or forward-filled. An explicit missing-state caption identifies unavailable emotion history.

Technical signals show the essential name, a prominent purple numeric reading and a quiet position rail. Range endpoints, verbal states and threshold explanations are available through the same hover, focus and touch bubble. Missing values have no position marker. Each technical bubble also shows its existing raw-value history in the shared time window, with an exact-date marker. These retain their original units rather than fabricated normalized scores. Calculations and display domains remain unchanged.

## Validation

Review full-page desktop 1440px and mobile 390px screenshots, all current and historical signal bubbles, calendar keyboard/touch behavior, verified holidays, missing sessions, four trend ranges, search and failure recovery. Automated overflow, date coverage, point counts and browser-error checks complement visual review. Passing a build alone is insufficient.
