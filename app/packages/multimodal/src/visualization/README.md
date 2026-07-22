# visualization

This is the presentation engine.

Visualization turns prepared data into semantic rendering families: 2D media,
3D scene, map, plot, structured message, and logs. Shared interaction and
WebGPU machinery are lower-level foundations. Cross-family experiences live in
an explicit composition domain rather than making semantic families depend on
one another. This layer owns textures, cameras, picking, virtualization, and
render-level interaction.

Renderers receive data and callbacks. They do not choose streams, query a
session, interpret layout policy, or persist product settings; those decisions
belong to views.

Its dependencies point down to IR, low-level codecs, and domain-free utilities.
It must not import views, runtime policy, data acquisition, schemas, decoders,
or adapters. Package-internal consumers use canonical modules directly; the
root entrypoint stays deliberately narrow instead of becoming an eager,
all-purpose barrel.
