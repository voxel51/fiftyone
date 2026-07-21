# temporal tags

This is the product-owned annotation system for spans of episode time.

Temporal tags connect persisted dataset annotations to playback and grid
surfaces. The namespace owns their request shapes, mutation lifecycle, and UI
projection while treating time as the shared runtime defines it.

Keep this separate from generic playback. Sessions can exist without dataset
annotations, and the runtime should not acquire product-specific persistence
just because a view can display it.
