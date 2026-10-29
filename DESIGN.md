# trendbeak visual system

White canvas, thin separators, tabular figures and the approved five-bar icon remain the visual foundation. The lowercase wordmark uses a muted green-to-coral gradient for `trend` and gray lavender for `beak`. Font outlines are generated from the existing DM Sans font, so the SVG is portable and independent of installed fonts.

## Calendar

DayPicker 10.0.2 replaces the activity-heatmap library. The full trailing 365 calendar dates remain visible in monthly layouts. A small leading-month fragment avoids wasting a whole month frame on the first few dates; the remaining months use standard numbered calendars. Both markets share dates, month placement and the return legend. Verified closed days are disabled, and unavailable sessions remain distinct from closures.

DayPicker owns focus movement and keyboard navigation; custom buttons forward its props, disabled state and handlers. Dates are interpreted in UTC as calendar labels, without applying a second exchange-time-zone conversion. Selecting a trading date updates both markets. A closed counterpart displays missing readings instead of borrowing a different session.

## Signals

The four shared range controls use 30, 90, 180 and 365 natural days. Emotion and benchmark prices keep separate axes and shared line semantics. No observations are invented, interpolated or forward-filled. An explicit missing-state caption identifies unavailable emotion history.

Technical signals show the essential name, a prominent purple numeric reading and a quiet position rail. Range endpoints, verbal states and threshold explanations are available through the same hover, focus and touch bubble. Missing values have no position marker. Calculations and display domains remain unchanged.

## Validation

Review full-page desktop 1440px and mobile 390px screenshots, all current and historical signal bubbles, calendar keyboard/touch behavior, verified holidays, missing sessions, four trend ranges, search and failure recovery. Automated overflow, date coverage, point counts and browser-error checks complement visual review. Passing a build alone is insufficient.
