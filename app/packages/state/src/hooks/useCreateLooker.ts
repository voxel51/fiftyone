import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import {
  EMBEDDED_DOCUMENT_FIELD,
  getMimeType,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { useCallback, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { mainGroupSample, selectedMediaField } from "../recoil";

import { selectedSamples, SampleData } from "../recoil/atoms";
import * as schemaAtoms from "../recoil/schema";
import { datasetName } from "../recoil/selectors";
import { State } from "../recoil/types";
import { getSampleSrc } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";

export default <T extends FrameLooker | ImageLooker | VideoLooker>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<ReturnType<T["getDefaultOptions"]>, "selected">,
  highlight: boolean = false
) => {
  const selected = useRecoilValue(selectedSamples);
  const isClip = useRecoilValue(viewAtoms.isClipsView);
  const isFrame = useRecoilValue(viewAtoms.isFramesView);
  const isPatch = useRecoilValue(viewAtoms.isPatchesView);
  const handleError = useErrorHandler();
  const activeId = isModal ? useRecoilValue(mainGroupSample)._id : null;

  const view = useRecoilValue(viewAtoms.view);
  const dataset = useRecoilValue(datasetName);
  const mediaField = useRecoilValue(selectedMediaField(isModal));

  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE })
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME })
  );

  const create = useCallback(
    ({ frameNumber, frameRate, sample, urls }: SampleData): T => {
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
        src: getSampleSrc(urls[mediaField]),
        support: isClip ? sample.support : undefined,
        thumbnail,
        dataset,
        view,
      };

      const looker = new constructor(sample, config, {
        ...options,
        selected: selected.has(sample._id),
        highlight: highlight && sample._id === activeId,
      }) as T;

      looker.addEventListener("error", (event) => {
        handleError(event.error);
      });

      return looker;
    },
    [isClip, isFrame, isPatch, options, thumbnail, activeId, mediaField]
  );
  const createLookerRef = useRef<(data: SampleData) => T>(create);

  createLookerRef.current = create;
  return createLookerRef;
};
