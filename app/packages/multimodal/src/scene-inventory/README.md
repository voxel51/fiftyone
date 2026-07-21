# scene inventory

This namespace answers one question: what can this episode put in a scene?

It turns normalized stream metadata into renderer-facing sources, stable
labels, and synchronization policy. The result is a descriptive inventory that
views can present and runtime can schedule.

It does not read media or render it. Keeping discovery separate from delivery
means menus, defaults, and layout can reason about the scene before expensive
data starts moving.
