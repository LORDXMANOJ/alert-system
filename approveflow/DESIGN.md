# ApproveFlow design

## World
Grape-black operations console. Structure comes from hairlines, space and type, never from boxed cards. Every corner is square. One signature motion: work flows left to right (page content reveals from the left edge, a tea-green line sweeps the top on each navigation, the stage band grows from the left).

## Colour tokens (globals.css)
| Token | Hex | Use |
|---|---|---|
| ink / ink-2 / ink-3 | #0D0A0F / #131016 / #1B161F | page, sidebar and inputs, hover and raised |
| line / line-2 | #2A2330 / #3B3242 | hairlines, control borders, empty meter ticks |
| fg / fg-2 / fg-3 | #ECEEED / #C3D2D5 / #918B9B | primary, secondary, muted text |
| tea | #C1F7DC | primary action, focus, on track |
| sky | #C3D2D5 | waiting on someone else |
| lilac | #BDA0BC | due within 7 days |
| late | #E8789F | overdue (Dusty Mauve brightened for contrast on dark) |
| grape | #824670 | done, selection, avatars |
| mauve | #A2708A | closed text |

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
`brand/approveflow-symbol.svg`: an A whose crossbar is the approval tick. Tea Green on ink. Draws itself (A, then tick) on the post-sign-in screen.

## Imagery
Duotone (grayscale, multiplied with grape) architecture photographs from Unsplash via Picsum. No people, no faces.
