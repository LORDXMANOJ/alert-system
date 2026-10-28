# ApproveFlow design

## World
Beige ground, Pitch Black type, Regal Navy actions, Sky Aqua highlights. Structure comes from hairlines, space and type, never from boxed cards. Every corner is square. One signature motion: work flows left to right (page content reveals from the left edge, a navy line sweeps the top on each navigation, the stage band grows from the left).

## Colour tokens (globals.css)
Palette: Pitch Black #141204, Regal Navy #083D77, Beige #F2F3D9, Sky Aqua #57C4E5 and #51D6FF. Beige is the page; the darker colours carry text and actions.
| Token | Hex | Use |
|---|---|---|
| ink | #F2F3D9 (Beige) | page background |
| ink-2 / ink-3 | #F8F9E8 / #E6E8C6 | sidebar and inputs, hover and raised |
| line / line-2 | #D3D5AE / #7F8157 | hairlines, control borders |
| fg / fg-2 / fg-3 | #141204 / #3A3820 / #66644A | primary, secondary, muted text |
| accent | #083D77 (Regal Navy) | primary action, links, focus, done |
| aqua / aqua-2 | #57C4E5 / #51D6FF (Sky Aqua) | text selection, activity and region bars |
| sky | #0B6E94 | waiting on someone else (Sky Aqua, darkened to read on Beige) |
| ok | #1F7A3E | on track |
| amber | #A8650F | due within 7 days |
| late | #B4232C | overdue |

Sky Aqua is too light to carry small text on Beige, so it is used for fills and highlights, and a darker tuned blue (sky) carries the "waiting" status.

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
`brand/approveflow-symbol.svg`: an A whose crossbar is the approval tick. Regal Navy on Beige. Draws itself (A, then tick) on the post-sign-in screen.

## Imagery
Duotone (grayscale, multiplied with navy, fading into the Beige ground) architecture photographs from Unsplash via Picsum. No people, no faces.
