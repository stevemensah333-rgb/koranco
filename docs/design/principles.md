# Design principles

## Operational character

The interface is an operational enterprise tool for a working farm. It should communicate reliability, clarity, and consequence. Visual decisions must support frequent work and accurate interpretation, not resemble a marketing site or generic AI-generated SaaS dashboard.

Avoid decorative gradients, excessive glass effects, huge rounded cards, giant headings, excessive whitespace, emoji controls, arbitrary metrics, and layouts made from many equally weighted cards. Use restrained agricultural character without decorative imagery that competes with work.

Final colors, typography, iconography, and brand treatment require approval and are not chosen here.

## Field interactions

- Design phone-first for bright, variable field conditions and intermittent connectivity.
- Use high contrast, large touch targets, short paths, minimal typing, and plain language.
- Make current connectivity and synchronization status visible without relying on color alone.
- Confirm successful local capture separately from successful server synchronization.
- Make validation, failure, retry, and recovery unmistakable.
- Avoid dense interactions that depend on precise taps or uninterrupted sessions.

## Management interactions

- Favor useful information density, clear hierarchy, strong tables, filters, comparison, and reconciliation.
- Give important exceptions and pending actions priority over decorative summaries.
- Define every metric before displaying it and allow users to understand its source where appropriate.
- Design exports and printable views as deliberate workflows, not incidental buttons.

## Accessibility and system states

Use semantic structure, keyboard support, visible focus, sufficient contrast, meaningful labels, appropriate error association, and touch targets suitable for real devices. Accessibility is part of correctness and operational usability.

Every feature must deliberately cover loading, empty, validation, success, authorization failure, network/server failure, relevant offline state, and recovery/retry. Responsive behavior and content hierarchy should be designed together rather than added after desktop implementation.

