import { useCallback } from "react";
import { useErrorHandler } from "react-error-boundary";
import { getMimeType } from "../utils/generic";
import { SampleData } from "./atoms";

const getLookerType = useRecoilValue(lookerType);
const isClips = useRecoilValue(viewAtoms.isClipsView);
const fieldSchema = useRecoilValue(
  schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
);
const frameFieldSchema = useRecoilValue(
  schemaAtoms.fieldSchema({ space: State.SPACE.FRAME, filtered: true })
);

export default ({
  frameData,
  sample,
  url,
}: {
  frameData?: { frameNumner: number; frameRate: number };
  sample: { _id: string; filepath: string; [key: string]: any };
  url: string;
}) => {
  const handleError = useErrorHandler();

  return useCallback(() => {
    const Constructor = getLookerType(getMimeType(sample));
    const looker = new Constructor(sample, config, {
      ...lookerOptions,
      selected: selected.has(sample._id),
    });

    looker.addEventListener("error", (event: ErrorEvent) => {
      handleError(event.error);
    });
  }, [handleError]);
};
