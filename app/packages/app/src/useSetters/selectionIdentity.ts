import type { State } from "@fiftyone/state";

/** View stages after which a selected sample id no longer names a result. */
const CONVERTING_STAGE =
  /\.(ToPatches|ToEvaluationPatches|ToFrames|ToClips|ToTrajectories)$/;

export const convertsSampleIdentity = (stages: State.Stage[]) =>
  stages.some((stage) => CONVERTING_STAGE.test(stage._cls));
