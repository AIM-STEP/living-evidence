<!-- Agent: Codex | Task: Dashboard visual refinement | Session: 2026-10-20 -->
# Dashboard layout and typography

## Summary
Use a calm, flat work surface with the existing blue identity and golden-ratio columns. Make project management controls and summary text readable, keep tool names prominent, and align the header, content and footer.

## Method and sources
Internal research contains only an unrelated analysis-method report; no cached visual-design study or internal RAG helper is available. Three focused searches were used:
1. `site.linear.app now redesign UI typography hierarchy`
2. `site.vercel.com geist design system typography`
3. `site.w3.org WAI WCAG understanding target size minimum text spacing`

Sources read:
- https://linear.app/now/behind-the-latest-design-refresh — restrained icons, softer separation and consistent control placement.
- https://vercel.com/geist/typography — intentional type roles combining size, weight, line-height and tracking.
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum — sufficient target dimensions/spacing to reduce interaction errors.

## Existing patterns
`index.html` has the functional project dashboard, responsive golden-ratio split, local Inter fonts, ten flat tool rows and route/state handling. Its layered historical styles leave summary text at 7–9px, inconsistent buttons and different header/content widths. `app/theme.css` supplies blue tokens; `app/writing-workspace.css` uses simple panels and a compact consistent toolbar. Preserve DOM, JS, data keys, tool order and the removed navigation/headings.

## Decisions
| Decision | Rationale and source | Alternative |
|---|---|---|
| Keep local Inter and system CJK fallbacks | Consistent type roles without a new download; Vercel | New remote font rejected as unnecessary |
| 15px base, 19px tool names, 13–16px secondary UI | Readable hierarchy; Vercel | Existing 7–9px summary text rejected |
| Shared 1360px header/body/footer alignment and 8px spacing increments | Predictable placement and reduced visual noise; Linear | Independent container widths rejected |
| Preserve 1:1.618 columns, stack below 980px | User requirement with usable narrow content; Linear principles | Rigid desktop split on phones rejected |
| Subtle project panel, flat white tool rows, blue accents | Clear grouping without raised surfaces; Linear | Gradients and depth effects conflict with user preference |
| 40px controls, 44px form fields/touch controls, visible focus | Easier targeting; W3C | Existing tiny controls rejected |
| Single-column project summary inside the sidebar | Prevent crowding as text grows; Vercel hierarchy | Dense two-column microtext rejected |

Confidence: high for readability/target-sizing principles; subjective visual preference still requires user feedback.

## Findings and priorities
P0: repair summary typography, align column surfaces and container widths, keep navigation/functionality unchanged.
P1: normalize tabs, forms, dialogs, account controls and responsive behavior.
P2: visual review on desktop and mobile when a connected browser is available.

## Risks and verification
| Risk | Mitigation |
|---|---|
| Cascade conflicts | Page-only stylesheet loaded after the shared theme; specific component selectors |
| Long titles or larger text overflow | Flexible heights, min-width zero, wrap, responsive stacking |
| Functional regressions | DOM/scripts unchanged; existing dashboard route tests |
| Visual regressions | Browser connection currently unavailable; do not claim screenshot or computed-layout validation |

## Implementation
Add `app/dashboard.css`, link it only from `index.html`, validate route behavior and references, publish, and compare live assets. No new runtime dependencies or hooks. No academic sources were needed for this interface task.
