# extensions

Use this boundary when a feature should plug into a shared surface without
teaching that surface about the feature's internals.

Extensions depend on host runtime and port contracts plus IR. Extension
families remain independent; they integrate through the host rather than
importing one another or episode implementation details.
