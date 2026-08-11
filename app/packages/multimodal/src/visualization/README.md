# visualization

This is pure presentation layer.

Visualization turns prepared data into semantic rendering families: 2D media,
3D scene, map, plot, structured message, and logs. Shared interaction and
WebGPU machinery are lower-level foundations. This layer owns textures,
cameras, picking, virtualization, and render-level interaction.

Renderers receive data and callbacks. They do not choose streams, query a
session, interpret layout policy, or persist product settings; those decisions
belong to views.

It must not import views, runtime policy, data acquisition, schemas, decoders,
or adapters.
