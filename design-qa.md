# Pandora editorial landing design QA

- Source visual truth path: conversation attachments supplied by the user on 2026-07-13 (three Koya editorial-product references) plus the user-selected Pandora dark editorial implementation screenshot supplied on 2026-07-13.
- Implementation screenshot path: `output/playwright/landing-desktop-final.png` and `output/playwright/landing-mobile-final-390.png`.
- Viewports: Google Chrome at 1440 x 900 and 390 x 844.
- State: public landing page, default hero state; Clarify walkthrough selected; operations example active.
- Primary interactions tested: Start free navigation, keyboard activation of walkthrough tabs, operations-console advancement, and mobile navigation disclosure.
- Console errors checked: page-level JavaScript errors are asserted absent in the Chrome navigation scenario.

## Full-view comparison evidence

The implementation retains the selected Pandora black editorial theme while carrying over the references' strongest structural traits: a large asymmetric typographic hero, a real operational product panel beside the headline, a pale editorial problem section, fine grid dividers, compact mono labels, and product-detail panels instead of generic AI illustration. The user-requested “Proof before promises” section is absent in both final captures.

The supplied references are light-first and market a staffing service; Pandora intentionally maps their hierarchy and operational-card language into the locked dark voice-operations system rather than copying their brand palette or claims. The page remains a coherent Pandora product from hero through pricing and final CTA.

## Focused region comparison evidence

- Hero: the 1440 px capture preserves the source's left-copy/right-product balance, readable CTA hierarchy, narrow status eyebrow, and restrained border treatment. The operational console is real UI and clearly demonstrates the product loop.
- Operational walkthrough: the five-step tab rail is visibly selected, keyboard operable, and changes a focused panel without altering the page hierarchy.
- Phone-accessibility image: the generated Nigerian business portrait has the intended documentary tone, correct two-column crop, and no sci-fi or generic AI motifs.
- Mobile: the 390 px capture has no horizontal overflow, clipped primary action, duplicated content, or off-screen navigation control. Sections collapse in the same reading order as desktop.

## Required fidelity surfaces

- Fonts and typography: Inter is consistent across display and body text; JetBrains Mono is reserved for status labels and operational metadata. The display scale and tight tracking echo the references without breaking mobile wrapping.
- Spacing and layout rhythm: desktop sections use consistent max widths, border joins, and vertical spacing. Mobile cards become a single reading column with practical tap targets.
- Colors and visual tokens: black and neutral surfaces remain dominant. Blue means connected, amber means confirmation, green means completed, and red is reserved for failures or window chrome.
- Image quality and asset fidelity: the supporting portrait is a dedicated high-resolution raster asset with a stable crop. Existing futuristic helmet imagery is not used by the new landing page.
- Copy and content: the page consistently presents voice-first business operations, ordinary-phone accessibility, permissioned actions, tenant isolation, live plan entitlements, and web/telephone-first availability. It contains no invented customers, logos, or performance claims.

## Findings and comparison history

1. P2, resolved: the first high-DPR Pixel 7 full-page capture exceeded 31,000 physical pixels and appeared stitched twice in the inspection renderer. The operations example also conditionally inserted a transcript row. The transcript space is now reserved, and the final mobile evidence is captured at the required 390 x 844 CSS viewport with a single continuous page.
2. P2, resolved: the initial Chrome assertion expected a literal space across a visual line break in the hero. The accessible-text assertion now accepts whitespace at the break and passes in both desktop and mobile Chrome.
3. P2, resolved: Chrome video capture initially lacked Playwright FFmpeg. Local and CI browser setup now install the binary explicitly.

## Open questions

- No design-blocking questions remain. Provider-backed voice playback will be verified again when staging ElevenLabs credentials are connected.

## Implementation checklist

- [x] Remove the user-rejected proof section.
- [x] Preserve the selected dark editorial direction.
- [x] Verify desktop and mobile responsive layout in Google Chrome.
- [x] Verify core navigation and interactive product states.
- [x] Respect reduced-motion preferences.
- [x] Eliminate page-level errors in the tested public conversion path.

## Follow-up polish

- P3: after real usage data exists, measure mobile landing length and consider a compact pricing comparison drawer without removing plan transparency.

final result: passed
