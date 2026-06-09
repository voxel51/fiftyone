# @fiftyone/playback

Continuous-time playback engine + timeline chrome + a few demo tiles.
Streams register themselves with the engine; the engine drives a shared
clock, the chrome reads atoms via wrapper hooks.

## Layout

```text
src/
  lib/
    playback/                  # the engine
      PlaybackProvider         # mounts the store + context
      use-playback-engine      # RAF loop, registerStream, seek/play/pause
      use-playback-state       # usePlayhead, useIsPlaying, useDuration, …
      use-stream               # subscribe to a stream's committed value
      use-playback-stream      # register-on-mount helper for stream owners
      stream-base, atoms, types, utils
      use-video-stream / use-video-sync   # <video> bridge
    timeline/                  # legacy frame-based timeline API
    TrackProvider              # broadcasts available tracks + pin state
    constants

  views/                       # timeline chrome (Playback/Components/*)
    TimelineWithTracks   # full composition (header + drawer + tracks)
    TimelineHeader       # controls + ruler
    TimelineControls     # play/pause, step, time readout, loop bounds
    TimelineRuler        # tick marks, zoom, loop handles
    TimelineTrack        # one labeled row of events/intervals
    Playhead/            # PlayheadLine, PlayheadTime
    Loop/                # LoopBounds, LoopOverlays
    SimplePlaybackBar    # minimal YouTube-style scrub bar
    Timeline/            # legacy frame-based timeline + examples
    PlaybackTiles/       # demo tiles (Camera, Graph, Lidar, Json, Scene,
                         #            Blob, Blocking) — stories under
                         #            Playback/Tiles/*

  stories/                     # integration demos (Playback/Demos/*)
    BlockingStreamDemo, TimelineComposed, VideoPlayerDemo
    utils/                     # mock streams + TileStory harness
```

Stories surface as **Playback/Components/**, **Playback/Tiles/**, and
**Playback/Demos/** in Storybook.

## Two timeline systems

This package contains two independent timeline implementations. Use the
**continuous-time engine** for new work; the **frame-based timeline** is
legacy and should not be extended.

### Continuous-time engine (`lib/playback/`)

The primary API. Time is a floating-point number of seconds. Streams
register durations and buffer-state callbacks; the engine's RAF loop drives
a shared clock and stalls when any blocking stream isn't ready.

**When to use:** any new video/sensor playback surface. Wire streams with
`usePlaybackStream` (or `useVideoStream` for `<video>` elements), read
state with `usePlayhead` / `useIsPlaying` / `useDuration`, and compose
chrome from `TimelineWithTracks` or `SimplePlaybackBar`.

### Frame-based timeline (`lib/timeline/`)

Legacy API from the original imaVid player. Time is an integer frame
number; the animation loop lives in `use-create-timeline`. Used by the
existing `<Timeline>` component in `views/Timeline/`.

**When to use:** don't. Existing callers of `useTimeline` / `useFrameNumber`
should stay on this API until migrated, but no new features should be built
against it.
