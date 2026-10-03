/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  makeReaderResolver,
  snapshotTrack,
  withHeldFrames,
  type SurfaceOpsDeps,
} from "./frameReader";
import { instanceIdFromTrackId } from "./trackIdentity";

/**
 * Instance-level track identity rewrites (split / merge). The engine refuses
 * identity edits via `updateLabel`, so re-keying a frame is delete + recreate
 * under the new instance inside one transaction. Both load the tracks' frames
 * first, so they resolve once the transaction has run.
 */
export const makeTrackIdentityOps = (deps: SurfaceOpsDeps) => {
  const { actions, eventBus, engine } = deps;
  const { path } = deps.ctx;
  const readerFor = makeReaderResolver(deps);

  /**
   * The frame field a track lives on: the caller's explicit field, else its
   * active interaction ref's, else primary.
   */
  const fieldFor = (instanceId: string, explicit?: string): string =>
    explicit ??
    engine.interaction.getActive().find((ref) => ref.instanceId === instanceId)
      ?.path ??
    path;

  const splitTrack = async (
    trackId: string,
    atFrame: number,
    explicitPath?: string,
  ): Promise<void> => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId) {
      return;
    }

    const fieldPath = fieldFor(instanceId, explicitPath);
    const r = readerFor(fieldPath);
    const frames = r.trackFrames(instanceId);
    const split: { newInstanceId?: string } = {};

    await withHeldFrames(deps, frames, () => {
      const tail = snapshotTrack(r, instanceId, (frame) => frame >= atFrame);

      if (tail.length === 0) {
        return;
      }

      const minted = engine.mintInstanceId();
      split.newInstanceId = minted;

      // pin both sides of the cut as keyframes so each half's next re-lerp
      // keeps the shape at the boundary; the head is skipped when the cut is at
      // the track's first frame
      const lastHeadFrame = frames.filter((f) => f < atFrame).at(-1);
      const firstTailFrame = tail[0].frame;

      actions.transaction(() => {
        for (const { frame, det } of tail) {
          actions.deleteLabel({ path: fieldPath, instanceId, frame });
          actions.updateLabel(
            { path: fieldPath, instanceId: minted, frame },
            frame === firstTailFrame
              ? { ...r.content(det), keyframe: true }
              : r.content(det),
          );
        }

        if (lastHeadFrame !== undefined) {
          actions.updateLabel(
            { path: fieldPath, instanceId, frame: lastHeadFrame },
            { keyframe: true },
          );
        }
      });
    });

    const { newInstanceId } = split;

    if (!newInstanceId) {
      return;
    }

    eventBus.dispatch("annotation:trackSplit", {
      trackId,
      instanceId,
      newInstanceId,
      atFrame,
    });
  };

  const mergeTracks = async (
    sourceTrackId: string,
    targetTrackId: string,
    explicitPath?: string,
  ): Promise<void> => {
    const sourceInstanceId = instanceIdFromTrackId(sourceTrackId);
    const targetInstanceId = instanceIdFromTrackId(targetTrackId);

    if (
      !sourceInstanceId ||
      !targetInstanceId ||
      sourceInstanceId === targetInstanceId
    ) {
      return;
    }

    const fieldPath = fieldFor(sourceInstanceId, explicitPath);
    const r = readerFor(fieldPath);
    const occupied = new Set(r.trackFrames(targetInstanceId));
    const result = { merged: false };

    await withHeldFrames(deps, r.trackFrames(sourceInstanceId), () => {
      const sources = snapshotTrack(r, sourceInstanceId, () => true);

      if (sources.length === 0) {
        return;
      }

      result.merged = true;

      actions.transaction(() => {
        for (const { frame, det } of sources) {
          // target-wins: always drop the source box; only re-stamp onto the
          // target where it has no box on this frame
          actions.deleteLabel({
            path: fieldPath,
            instanceId: sourceInstanceId,
            frame,
          });

          if (!occupied.has(frame)) {
            actions.updateLabel(
              { path: fieldPath, instanceId: targetInstanceId, frame },
              r.content(det),
            );
          }
        }
      });
    });

    if (!result.merged) {
      return;
    }

    eventBus.dispatch("annotation:trackMerged", {
      sourceTrackId,
      targetTrackId,
      sourceInstanceId,
      targetInstanceId,
    });
  };

  return { splitTrack, mergeTracks };
};

export type TrackIdentityOps = ReturnType<typeof makeTrackIdentityOps>;
