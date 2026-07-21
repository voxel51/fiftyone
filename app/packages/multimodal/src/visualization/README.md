# visualization

This is the presentation engine.

Visualization turns normalized IR outputs into image, point-cloud, 3D, and
timeseries experiences. It owns GPU resources, textures, cameras, picking, and
render-level interaction, including measurement. It displays state supplied by
higher layers; it does not choose what product experience surrounds it.

Its dependencies point down to IR, decoders, types, and small pure utilities.
It must not import views, runtime policy, data acquisition, or adapters.
Package-internal consumers use canonical modules directly; the root entrypoint
stays deliberately narrow instead of becoming an eager, all-purpose barrel.
