# ADR-003: PWA field strategy

- Status: Accepted
- Date: 2026-08-07

## Context

Field workflows require a responsive interface and are expected to encounter intermittent connectivity. Maintaining separate web and native applications would add implementation, release, testing, and handover cost before a native-only requirement has been demonstrated.

## Decision

Provide the initial field application as an offline-capable responsive Progressive Web App from the same Next.js frontend used for management workflows. Use IndexedDB/Dexie when approved offline workflows are implemented. Do not build a separate Flutter or native application initially.

## Rationale

One frontend codebase reduces maintenance burden, simplifies deployment, and is expected to support the initial field functionality. Browser limitations must be validated on Koranco's actual supported devices and connectivity.

## Consequences

- Field and management experiences can differ while sharing one application and design system.
- Offline persistence, update behavior, browser storage limits, device support, and synchronization require deliberate testing.
- IndexedDB remains local operational storage; PostgreSQL is authoritative.
- A native application remains an option if field trials demonstrate a material PWA limitation that cannot be responsibly addressed.

