import { frameAt } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";
import { makeReaderResolver, type SurfaceOpsDeps } from "./frameReader";
import { instanceIdFromTrackId } from "./trackIdentity";

/** Per-frame track ops (keyframes, fills, trims, shifts, deletes, attributes). */
export const makeTrackOps = (deps: SurfaceOpsDeps) => {
  const { actions, eventBus, engine } = deps;
  const { path, fps, totalFrames } = deps.ctx;
  const readerFor = makeReaderResolver(deps);

  const markKeyframe = (time: number, trackIds: readonly string[]): void => {
    if (trackIds.length === 0) {
      return;
    }

    const frame = frameAt(time, fps, totalFrames);
    const changed: {
      trackId: string;
      instanceId: string;
      set: boolean;
      path: string;
    }[] = [];

    // one gesture key for the toggle and the auto-interpolate re-lerp it
    // triggers, so a single undo reverts both
    const undoKey = engine.mintGestureId();

    // a selected track may live on a non-primary frame field; its active
    // interaction ref says which
    const fieldByInstance = new Map(
      engine.interaction.getActive().map((ref) => [ref.instanceId, ref.path]),
    );

    actions.transaction(
      () => {
        for (const trackId of trackIds) {
          const instanceId = instanceIdFromTrackId(trackId);

          if (!instanceId) {
            continue;
          }

          const labelPath = fieldByInstance.get(instanceId) ?? path;
          const det = readerFor(labelPath).read(instanceId, frame);

          if (!det) {
            continue;
          }

          const set = !det.keyframe;
          const update: Partial<LabelData> = { keyframe: set };

          actions.updateLabel({ path: labelPath, instanceId, frame }, update);
          changed.push({ trackId, instanceId, set, path: labelPath });
        }
      },
      { undoKey },
    );

    for (const { trackId, instanceId, set, path: labelPath } of changed) {
      eventBus.dispatch("annotation:keyframeChanged", {
        trackId,
        instanceId,
        frame,
        kind: set ? "set" : "removed",
        path: labelPath,
        undoKey,
      });
    }
  };

  const extendTrack = (
    trackId: string,
    sourceFrame: number,
    targetFrames: number[],
    undoKey?: string,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || targetFrames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);
    const source = r.read(instanceId, sourceFrame);

    if (!source) {
      return;
    }

    // non-keyframe filler that a later propagate overwrites in place; the
    // source's mask rides along since it is relative to the copied box
    const filler = { ...r.content(source), keyframe: false };

    actions.transaction(
      () => {
        for (const frame of targetFrames) {
          if (frame >= 1 && frame <= totalFrames) {
            actions.updateLabel({ path: fieldPath, instanceId, frame }, filler);
          }
        }
      },
      undoKey ? { undoKey } : undefined,
    );
  };

  const trimTrack = (
    trackId: string,
    frames: number[],
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || frames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);

    actions.transaction(() => {
      for (const frame of frames) {
        if (r.read(instanceId, frame)) {
          actions.deleteLabel({ path: fieldPath, instanceId, frame });
        }
      }
    });
  };

  const shiftTrack = (
    trackId: string,
    frames: number[],
    delta: number,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || delta === 0 || frames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);

    // read the whole segment up front so the delete/write passes operate on
    // a stable snapshot
    const sources = frames
      .map((frame) => ({ frame, det: r.read(instanceId, frame) }))
      .filter((s): s is { frame: number; det: LabelData } => !!s.det);

    if (sources.length === 0) {
      return;
    }

    actions.transaction(() => {
      for (const { frame } of sources) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
      }

      for (const { frame, det } of sources) {
        const target = frame + delta;

        if (target >= 1 && target <= totalFrames) {
          actions.updateLabel(
            { path: fieldPath, instanceId, frame: target },
            r.content(det),
          );
        }
      }
    });
  };

  const deleteTrack = (trackId: string, fieldPath: string = path): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId) {
      return;
    }

    const frames = readerFor(fieldPath).trackFrames(instanceId);

    if (frames.length === 0) {
      return;
    }

    actions.transaction(() => {
      for (const frame of frames) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
      }
    });

    // let selection/editing consumers drop state bound to this track
    eventBus.dispatch("annotation:trackDeleted", { trackId });
  };

  const updateTrackAttributes = (
    trackId: string,
    attributes: Record<string, unknown>,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || Object.keys(attributes).length === 0) {
      return;
    }

    const r = readerFor(fieldPath);
    const frames = r.trackFrames(instanceId);

    actions.transaction(() => {
      for (const frame of frames) {
        actions.updateLabel({ path: fieldPath, instanceId, frame }, attributes);
      }
    });
  };

  return {
    markKeyframe,
    extendTrack,
    trimTrack,
    shiftTrack,
    deleteTrack,
    updateTrackAttributes,
  };
};

export type TrackOps = ReturnType<typeof makeTrackOps>;
