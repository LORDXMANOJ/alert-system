# ApproveFlow design

## World
Tea Green ground with dark-grape type. Structure comes from hairlines, space and type, never from boxed cards. Every corner is square. One signature motion: work flows left to right (page content reveals from the left edge, an accent line sweeps the top on each navigation, the stage band grows from the left).

## Colour tokens (globals.css)
The lightest palette colour is the page; the darker palette colours carry text, actions and structure.
| Token | Hex | Use |
|---|---|---|
| ink | #C1F7DC (Tea Green) | page background |
| ink-2 / ink-3 | #D6FAE8 / #AEE8C8 | sidebar and inputs, hover and raised |
| line / line-2 | #9FD8BA / #4F8F70 | hairlines, control borders |
| fg / fg-2 / fg-3 | #2B1226 / #4D2A45 / #67505F | primary, secondary, muted text (dark grape) |
| accent | #824670 (Grape Soda) | primary action, links, focus, completed stages |
| mauve | #A2708A (Dusty Mauve) | secondary marks |
| sky | #3F6B77 | waiting on someone else (Pale Sky, darkened to read on Tea Green) |
| ok | #1F7A53 | on track |
| amber | #A8650F | due within 7 days |
| late | #B8244F | overdue |

Pale Sky and Lilac are too light to read on a Tea Green ground, so status uses darker tuned versions; the five palette colours still drive the surfaces, text and accent.

## Type
- Display: Unbounded 300/400 for page titles, the sentence headline and figures.
- UI: Schibsted Grotesk.
- Data: IBM Plex Mono for IDs, dates and counts only.

## Status language
- `Mark`: square colour mark, explanation in a tooltip.
- `SlaBadge`: five-tick deadline meter (fills and changes colour as the deadline nears), detail in a tooltip.
- `Badge`: coloured text with a small mark, never a filled pill.
- Supporting copy lives in `InfoTip` tooltips, not on the page.

## Brand
`brand/approveflow-symbol.svg`: an A whose crossbar is the approval tick. Grape Soda on Tea Green. Draws itself (A, then tick) on the post-sign-in screen.

## Imagery
Duotone (grayscale, multiplied with grape, fading into the Tea Green ground) architecture photographs from Unsplash via Picsum. No people, no faces.
