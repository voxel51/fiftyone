# temporal tags

Temporal tags connect persisted dataset annotations to playback and grid
surfaces. The namespace owns their UI projection for episodes while treating
time as the shared runtime defines it.

The request shapes, route client and mutation lifecycle live in
`@fiftyone/state`, because the same records back the video surfaces in
`@fiftyone/video-annotation`, which cannot depend on this package. What remains
here is the sample renderer adapter and the facade that re-exports both.

It depends only on runtime timing capabilities and IR, never on source formats,
queries, or episode implementation details.
