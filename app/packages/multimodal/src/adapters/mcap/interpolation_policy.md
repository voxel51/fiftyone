# MCAP Time-Resolution Policy

This is the product contract for answering: what content do we draw at timeline
time `t`, and where do we place it?

The short version:

- Media is content. Use latest-at-or-before lookup, never future content.
- Media lookback is unbounded by default. If the displayed sample is old, keep
  rendering it and say so.
- Transforms are placement state. Interpolate them at the content sample's own
  timestamp.
- Missing placement should be visible to the user. Do not silently draw content
  in a frame we know is wrong.

## Media

Images, point clouds, detections, masks, and logs are observations. They are
sampled content, not continuous state.

Policy:

- Select the newest message with `message_time <= playhead_time`.
- Never select future media.
- If there is no prior message, publish `null` and show an empty/gap state.
- Do not clear old media just because it crosses an age threshold.
- If the displayed media is older than `staleMediaWarningMs`, show a stale
  badge.

Default:

- `staleMediaWarningMs = 500`

Why the lookback is unbounded: blanking every sparse or dropped stream after a
short age limit makes playback feel broken and hides useful context. Holding
the last real observation is honest as long as the UI clearly says it is stale.
The important line is that we never borrow from the future.

## Transforms

Frame transforms describe a sampled continuous trajectory. For offline
playback, samples on both sides of a query time are already on disk, so using
the later sample for interpolation is reconstruction, not future-content
leakage.

Policy:

- Resolve each content item at that item's `contentTimeNs`, not the playhead.
- Preserve static transforms and identity transforms exactly.
- For dynamic transforms with bracketing samples, linearly interpolate
  translation and slerp rotation.
- If `maxInterpolationGapMs > 0`, reject interpolation across larger gaps.
- If a query is just outside the first or last sample for an edge, clamp to the
  nearest edge sample only within `boundaryClampMs`.
- Do not extrapolate outside that boundary clamp.
- Include resolution metadata so callers can distinguish exact, static,
  interpolated, clamped, pending, and missing placement.

Defaults:

- `maxInterpolationGapMs = 0` (no hard gap limit)
- `transformGapWarningMs = 2000`
- `boundaryClampMs = 50`

Why the max gap default is unlimited: a strict default can make first playback
look broken on real files whose transform rate or batching does not match our
expectations. We still surface large-gap placement with a warning, so the user
gets a smooth view without mistaking low-confidence interpolation for perfectly
dense data.

## Pairing Rule

Media lookup and transform lookup intentionally use different clocks.

If the playhead is at `T` and the latest point cloud was stamped at `t_cloud`,
place that cloud with:

```text
lookupTransform(world, cloud_frame, t_cloud)
```

not:

```text
lookupTransform(world, cloud_frame, T)
```

Using the playhead for placement moves old content to a newer pose and creates
the jitter, smearing, and "haywire" behavior that this policy is meant to
avoid.

## Boundaries

Interpolation needs a sample before and after the query time. At the beginning
or end of a transform edge's available range, we allow a small clamp to avoid
blanking good content because the transform stream is offset by a few
milliseconds.

The clamp is edge-local, not a frame-zero special case:

- Query before the first sample: use the first sample only if it is within
  `boundaryClampMs`.
- Query after the last sample: use the last sample only if it is within
  `boundaryClampMs`.
- Otherwise the transform is missing.

## 3D Rendering

The 3D panel follows the same policy per layer:

- Build point-cloud layers from timestamp-aware playback frames.
- Resolve every layer's transform at that layer's `contentTimeNs`.
- Drop layers with missing transforms and report the unresolved frame IDs.
- While transform ranges are still loading, keep the panel in a loading state
  instead of flashing incorrect or empty geometry.
- Warn for boundary clamps and large interpolation gaps.
- Do not warn for ordinary interpolation.

## User Settings

The left sidebar exposes a "Time synchronization" section with:

- Stale frame warning (`staleMediaWarningMs`)
- Max interpolation gap (`maxInterpolationGapMs`)
- Transform gap warning (`transformGapWarningMs`)
- Boundary clamp (`boundaryClampMs`)
- Reset to defaults

All values are milliseconds. `0` disables the corresponding tolerance or
warning, except that `maxInterpolationGapMs = 0` means no hard interpolation
gap limit.

## Live Playback Later

This policy targets offline MCAP playback. If we add live streaming, media
stays causal and transforms may need a short wait for future samples that have
not arrived yet. That live wait should be a separate setting from offline
interpolation.
