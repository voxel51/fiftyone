# extensions

This is the sanctioned way to add product behavior to a stable host.

Extensions contribute bounded UI and runtime behavior through explicit
contracts. Registration and ordering are deliberate, so import order never
becomes product policy. The host keeps control of lifecycle and composition;
extensions describe what they add.

Use this boundary when a feature should plug into a shared surface without
teaching that surface about the feature's internals.
