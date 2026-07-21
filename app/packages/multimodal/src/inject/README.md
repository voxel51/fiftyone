# inject

This is the one intentional knot in the dependency graph.

The injection namespace connects concrete adapters to the format-neutral
runtime and registers application-facing views. It is allowed to know both
sides because composition has to happen somewhere.

Keep it tiny and unsurprising. Importing this namespace means “boot the
multimodal system,” so ordinary runtime, adapter, and view code must never
reach back into it.
