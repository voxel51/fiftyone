# stream selection

Stream selection owns source-neutral naming, pairing, and default-ordering
policy for related streams. It turns stream names and semantic kinds into
stable choices without knowing how the source is stored or how a view renders
the result.

This is a pure domain leaf shared by adapters, scene inventory, and views. It
must not depend on transport schemas, format implementations, runtime state, or
UI.
