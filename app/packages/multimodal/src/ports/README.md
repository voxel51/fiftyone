# ports

Ports are like IRs - but behaviors. They are interfaces for shared behaviors.

Ports define the operations and lifecycle guarantees the system relies on:
opening a source, reading frames, fetching bytes, observing cancellation, and
using optional capabilities. The core owns these contracts; adapters and
resources provide concrete implementations.

A port may speak in IR values, but it should not expose vendor types, React
state, or one format's internal machinery. That is what keeps implementations
replaceable.

Contract-level errors live here when callers and implementations must agree on
their identity or lifecycle meaning. Generic conversion of an unknown caught
value remains a domain-free utility.
