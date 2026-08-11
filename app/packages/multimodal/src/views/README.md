# views

This is the application layer.

Views bind dataset and sample lifecycle to sessions, runtime policy,
visualization, extensions, and navigation. They own the modal, grid, explorer,
and episode experiences: what users can do, which renderers appear, and how the
surfaces fit together.

Views may depend on visualization; visualization must never depend back on
views.

A view may be format-branded when the user interaction itself targets that
format, as the MCAP explorer does. That is a product distinction, not
permission to parse the format here: even a format-branded view must enter
through neutral IR, port, and runtime capabilities while vendor machinery stays
in adapters.
