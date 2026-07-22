# views

This is the application layer.

Views bind dataset and sample lifecycle to sessions, runtime policy,
visualization, extensions, and navigation. They own the modal, grid, explorer,
and episode experiences: what users can do, which renderers appear, and how the
surfaces fit together.

This is not a general React component drawer. Code belongs here when it owns a
product decision or composes several lower-level capabilities. Views may depend
on visualization; visualization must never depend back on views. Format parsing
and adapter internals also stay outside this boundary.

Views express intent through runtime and port capabilities. They do not build
query clients, interpret generated schemas, or import decoder implementation.

A view may be format-branded when the user interaction itself targets that
format, as the MCAP explorer does. That is a product distinction, not
permission to parse the format here: even a format-branded view must enter
through neutral IR, port, and runtime capabilities while vendor machinery stays
in adapters.
