import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { EMBEDDED_DOCUMENT_FIELD, LIST_FIELD } from "@fiftyone/utilities";
import { useCallback, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { RecoilValue, useRecoilValue } from "recoil";

import { selectedSamples, SampleData } from "../recoil/atoms";
import * as schemaAtoms from "../recoil/schema";
import { State } from "../recoil/types";
import { getSampleSrc } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";

import { getMimeType } from "../utils/generic";

export default <T extends FrameLooker | ImageLooker | VideoLooker>(
  thumbnail: boolean,
  optionsAtom: RecoilValue<Omit<ReturnType<T["getDefaultOptions"]>, "selected">>
) => {
  const createLookerRef = useRef<(data: SampleData) => T>();
  const selected = useRecoilValue(selectedSamples);
  const isClip = useRecoilValue(viewAtoms.isClipsView);
  const isFrame = useRecoilValue(viewAtoms.isFramesView);
  const isPatch = useRecoilValue(viewAtoms.isPatchesView);
  const options = useRecoilValue(optionsAtom);
  const handleError = useErrorHandler();

  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME, filtered: true })
  );

  createLookerRef.current = useCallback(
    ({ dimensions, frameNumber, frameRate, sample, url }: SampleData): T => {
      const video = getMimeType(sample).startsWith("video/");
      let constructor:
        | typeof FrameLooker
        | typeof ImageLooker
        | typeof VideoLooker = ImageLooker;
      if (video && (isFrame || isPatch)) {
        constructor = FrameLooker;
      }

      if (video) {
        constructor = VideoLooker;
      }

      const config: ReturnType<T["getInitialState"]>["config"] = {
        dimensions,
        fieldSchema: {
          ...fieldSchema,
          frames: {
            name: "frames",
            ftype: LIST_FIELD,
            subfield: EMBEDDED_DOCUMENT_FIELD,
            embeddedDocType: "fiftyone.core.frames.FrameSample",
            fields: frameFieldSchema,
            dbField: null,
          },
        },
        frameNumber: constructor === FrameLooker ? frameNumber : undefined,
        frameRate,
        sampleId: sample._id,
        src: getSampleSrc(sample.filepath, sample._id, url),
        support: isClip ? sample.support : undefined,
        thumbnail,
      };

      const looker = new constructor(sample, config, {
        ...options,
        selected: selected.has(sample._id),
      }) as T;

      looker.addEventListener("error", (event) => {
        handleError(event.error);
      });

      return looker;
    },
    [isClip, isFrame, isPatch, options, thumbnail]
  );

  return createLookerRef;
};
