# Design principles

## Operational character

The interface is an operational enterprise tool for a working farm. It should communicate reliability, clarity, and consequence. Visual decisions must support frequent work and accurate interpretation, not resemble a marketing site or generic AI-generated SaaS dashboard.

Avoid decorative gradients, excessive glass effects, huge rounded cards, giant headings, excessive whitespace, emoji controls, arbitrary metrics, and layouts made from many equally weighted cards. Use restrained agricultural character without decorative imagery that competes with work.

The Phase 2 visual foundation uses a restrained neutral canvas, white working surfaces, charcoal text, and a dark leaf-green brand accent. Blue is reserved for links, focus, and informational states; success, warning, and error retain distinct text labels and shapes as well as color. These choices are documented in [the design system](system.md) and still require Koranco visual approval before they are treated as final brand standards.

Typography uses a system sans-serif stack for predictable loading, excellent compact readability, and straightforward handover. Operational quantities use tabular lining numerals where alignment improves scanning. Headings remain proportionate to the application rather than adopting marketing-page scale.

## Field interactions

- Design phone-first for bright, variable field conditions and intermittent connectivity.
- Use high contrast, large touch targets, short paths, minimal typing, and plain language.
- Make current connectivity and synchronization status visible without relying on color alone.
- Confirm successful local capture separately from successful server synchronization.
- Make validation, failure, retry, and recovery unmistakable.
- Avoid dense interactions that depend on precise taps or uninterrupted sessions.
- Keep field controls at least 48px high and preserve a stable primary-action region on phone layouts.
- Treat locally saved, pending, syncing, synced, and attention states as explicit text concepts when offline behavior is implemented; never imply that local capture equals server acceptance.

## Management interactions

- Favor useful information density, clear hierarchy, strong tables, filters, comparison, and reconciliation.
- Give important exceptions and pending actions priority over decorative summaries.
- Define every metric before displaying it and allow users to understand its source where appropriate.
- Design exports and printable views as deliberate workflows, not incidental buttons.
- Use a persistent desktop navigation region and compact page headings, while switching to shallow horizontal navigation on smaller screens rather than compressing a sidebar.

## Accessibility and system states

Use semantic structure, keyboard support, visible focus, sufficient contrast, meaningful labels, appropriate error association, and touch targets suitable for real devices. Accessibility is part of correctness and operational usability.

Every feature must deliberately cover loading, empty, validation, success, authorization failure, network/server failure, relevant offline state, and recovery/retry. Responsive behavior and content hierarchy should be designed together rather than added after desktop implementation.

The shared focus treatment uses a high-contrast blue outline and offset rather than relying on browser-specific defaults. Motion is minimal; loading motion respects `prefers-reduced-motion`. Semantic HTML is preferred to additional ARIA, and critical states always include visible language.
