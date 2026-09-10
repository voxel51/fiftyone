import {
  makeReaderResolver,
  snapshotTrack,
  type SurfaceOpsDeps,
} from "./frameReader";
import { instanceIdFromTrackId } from "./trackIdentity";

/**
 * Instance-level track identity rewrites (split / merge). The engine refuses
 * identity edits via `updateLabel`, so re-keying a frame is delete + recreate
 * under the new instance inside one transaction.
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

  const splitTrack = (
    trackId: string,
    atFrame: number,
    explicitPath?: string,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId) {
      return;
    }

    const fieldPath = fieldFor(instanceId, explicitPath);
    const r = readerFor(fieldPath);
    const tail = snapshotTrack(r, instanceId, (frame) => frame >= atFrame);

    if (tail.length === 0) {
      return;
    }

    const newInstanceId = engine.mintInstanceId();

    // pin both sides of the cut as keyframes so each half's next re-lerp keeps
    // the shape at the boundary; the head is skipped when the cut is at the
    // track's first frame
    const headFrames = r.trackFrames(instanceId).filter((f) => f < atFrame);
    const lastHeadFrame = headFrames.at(-1);
    const firstTailFrame = tail[0].frame;

    actions.transaction(() => {
      for (const { frame, det } of tail) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
        actions.updateLabel(
          { path: fieldPath, instanceId: newInstanceId, frame },
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

    eventBus.dispatch("annotation:trackSplit", {
      trackId,
      instanceId,
      newInstanceId,
      atFrame,
    });
  };

  const mergeTracks = (
    sourceTrackId: string,
    targetTrackId: string,
    explicitPath?: string,
  ): void => {
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
    const sources = snapshotTrack(r, sourceInstanceId, () => true);

    if (sources.length === 0) {
      return;
    }

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
