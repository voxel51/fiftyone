# Annotation engine coding standards

Binding for any code that reads or writes through the annotation engine
(`AnnotationEngine`, `useAnnotationEngine`, `SurfaceActions`), wherever it
lives. The design behind these rules is in
[`src/engine/README.md`](src/engine/README.md).

## Writes

| Do                                                                         | Don't                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Write through `SurfaceActions`/controller inside gestures                  | Write from inside any subscriber/selector (dev guard throws)    |
| Re-read via `getLabel` when notified — payloads are invalidation, not data | Cache labels in a second store and try to keep it synced        |
| One `transaction` per user-visible step, `undoKey` to coalesce             | Wrap an `await` inside a transaction (they are synchronous)     |
| Let interaction GC own pruning on delete/reset                             | Manually deselect on delete (you'll fight the anchor promotion) |
| Mint identity once (engine `create`, or durable-from-birth drafts)         | Re-id by evict + re-add (kills handle identity and selection)   |

## Whole-track work

A video's `FrameStore` holds a window of frames, not the clip: the frames near
the playhead, the frames an operation holds, and every frame edited this
session. `enumerateLabels` and `loadedFrames` return only that window, so
walking them to reach a track's frames misses the rest of the track.

Anything that reads or writes every frame of a track first awaits
`trackIndexReady` and stops if it resolves `false`, then gets the track's
frames from `trackFrames`, loads them with `holdFrames`, and writes inside the
hold:

```ts
if (!(await engine.trackIndexReady(ref.sample))) {
    return;
}

const { frames } = engine.trackFrames(ref);
const release = await engine.holdFrames(ref.sample, frames);

try {
    engine.transaction(() => {
        for (const frame of frames) {
            engine.updateLabel({ ...ref, frame }, partial);
        }
    });
} finally {
    release();
}
```

- Read `trackFrames` after `trackIndexReady` resolves, not before.
- `trackIndexReady` waits while the track index loads and resolves `false` when
  it failed. On `false`, refuse the whole operation, including the frame the
  user edited: a partial write splits the track. The surface shows one notice
  for the failure, so the refused operation shows none.
- Await `holdFrames` before the transaction, never inside it.
- Always release, including when the work throws.
- `trackFrames` combines the server index with this session's edits.
- Stores without a frame source (images, 3D) hold everything: `trackIndexReady`
  resolves `true` and `holdFrames` resolves at once, so the same code is
  correct there.

Existing helpers: `withHeldFrames` in
`video-annotation/src/tracks/frameReader.ts` for track ops (whose
`trackIndexReady` gate is applied where `useVideoSurfaceActions` assembles
them), and `withTrackHeld` in the Annotate sidebar's `trackFanOut.ts`, which
gates on its own.
