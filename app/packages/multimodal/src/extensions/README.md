# extensions

Use this boundary when a feature should plug into a shared surface without
teaching that surface about the feature's internals.

Shared registry and data-plane contracts live under `host/`. Extension families
may depend on that host boundary, but never on sibling family implementations.
