# runtime

Runtime is the policy engine between ports and product UI.

It turns session capabilities into demand, time windows, synchronization,
transform resolution, caching policy, and fallback behavior. Runtime can
coordinate work across streams, but it should not know how a format is encoded
or how a panel draws the result.

Optional accelerations must preserve the semantics of the shared fallback. That
rule lets performance improve without creating two versions of playback.

Core runtime is headless and depends on ports, query, IR, and domain-free
utilities. Framework bindings live in an explicit integration subpath so
workers and non-React callers never load component code.
