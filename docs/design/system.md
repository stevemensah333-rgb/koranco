# Design system

The design system is intentionally small. It provides stable visual and interaction foundations for later validated workflows without prescribing unknown domain behavior.

## Tokens

Tokens are CSS custom properties in `apps/web/src/styles/globals.css`. Components use semantic tokens rather than embedding unrelated colors or spacing values.

- Type: system sans-serif, 12–28px application scale, 1.2 heading and 1.5 body line heights, regular through bold weights.
- Spacing: a 4px base progression from 4–48px, responsive page gutters, a 1280px maximum management content width, and a 704px reading width.
- Controls: 44px standard controls, 40px compact management controls, and 48px field touch targets.
- Shape: 4px, 8px, and 12px radii. Use the smallest appropriate radius; large rounded containers are not the default.
- Elevation: one restrained shadow token for a genuinely raised boundary. Structure normally comes from borders and surface changes.
- Focus: a blue 2px outline for general elements and a blue focus ring for form controls, always visible against neutral and branded surfaces.

## Typography

Use the native system sans-serif stack. It avoids a font network dependency, performs consistently, and remains readable at the compact sizes required by forms and tables. Use tabular lining numerals for times, counts, quantities, and aligned report columns. Do not add decorative display faces.

## Palette

The neutral base uses a pale warm-gray canvas (`#f2f3ef`), white work surfaces, charcoal primary text (`#172019`), muted gray-green text, and visible gray borders. Dark leaf green (`#245c3b`) identifies Koranco and primary actions without covering the application in green.

Blue differentiates links, focus, and information from brand actions. Success green, warning ochre, and error red use paired soft surfaces and strong text. Every status includes text and a marker or structural treatment; color is never its only meaning. Final brand approval and contrast review on representative field devices are still required.

## Responsive models

Management layouts use a full-width top bar and a persistent left navigation anchored to the viewport's left edge at tablet/desktop widths. The working canvas begins immediately to the right of the sidebar, and only the content region is bounded horizontally for readability; the shell itself is never centered. Compact page headings, tables, and contextual actions support the density. Smaller widths use shallow horizontally scrollable navigation; the desktop sidebar is not merely squeezed onto a phone.

Field layouts use a compact identity/context header, one main task area, a visible future status location, and a stable bottom action region. Controls meet the 48px touch-target standard. The field shell does not imply any synchronization behavior.

The sign-in page reuses the management top bar and application identity, so the unauthenticated and authenticated states read as the same product. It centers a single restrained panel (white surface, subtle raised shadow) with a compact header and form on the canvas background, with no marketing copy or decorative elements.

## Component principles

- Buttons express one clear action and have primary, secondary, danger, disabled, and full-width field forms.
- Labels remain visible. Guidance precedes the control; errors follow it and are associated programmatically.
- Badges describe compact state. Alerts explain consequence and recovery.
- Tables retain semantic headers and captions, align numeric cells, expose intentional horizontal overflow to keyboard users, and provide loading/empty rows.
- Empty states explain what is absent and offer an action only when a valid next step exists.
- Loading indicators include accessible text and reduced-motion behavior.
- Shells provide landmarks, skip navigation, bounded content, and usage-specific responsive navigation.

Avoid configuration-heavy components. Add variants only when a real repeated workflow demonstrates the need.

## Development review

`/dev/design-system` presents synthetic component and shell examples only in the Next.js development environment. Production requests resolve as not found. It is a visual review aid, not a source of farm data or an operational route.
