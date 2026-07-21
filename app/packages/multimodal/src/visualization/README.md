# visualization

This is the presentation engine.

Visualization turns prepared data into semantic rendering families: image, 3D
scene, map, plot, structured message, and logs. Shared interaction and WebGPU
machinery sit beside those families because they support several renderers
without being tile types themselves. This layer owns textures, cameras,
picking, virtualization, and render-level interaction.

Renderers receive data and callbacks. They do not choose streams, query a
session, interpret layout policy, or persist product settings; those decisions
belong to views.

Its dependencies point down to IR, decoders, types, and small pure utilities.
It must not import views, runtime policy, data acquisition, or adapters.
Package-internal consumers use canonical modules directly; the root entrypoint
stays deliberately narrow instead of becoming an eager, all-purpose barrel.
