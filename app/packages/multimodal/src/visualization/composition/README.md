# composition

Composition owns renderers that deliberately combine multiple semantic
visualization families into one calibrated experience, such as relating 3D
geometry to image space.

It is the only visualization domain allowed to coordinate sibling families.
Families remain independently reusable and must never depend back on
composition. Product scheduling, stream selection, and persisted settings still
belong to views.
