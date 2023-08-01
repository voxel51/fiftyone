import {
  AbstractLooker,
  FrameLooker,
  ImageLooker,
  PcdLooker,
  Sample,
  VideoLooker,
} from "@fiftyone/looker";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  getMimeType,
} from "@fiftyone/utilities";
import { useCallback, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { ModalSample, selectedMediaField } from "../recoil";
import { selectedSamples } from "../recoil/atoms";
import * as schemaAtoms from "../recoil/schema";
import { datasetName } from "../recoil/selectors";
import { State } from "../recoil/types";
import { getSampleSrc } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";

export default <T extends AbstractLooker>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<Parameters<T["updateOptions"]>[0], "selected">,
  highlight?: (sample: Sample) => boolean
) => {
  const selected = useRecoilValue(selectedSamples);
  const isClip = useRecoilValue(viewAtoms.isClipsView);
  const isFrame = useRecoilValue(viewAtoms.isFramesView);
  const isPatch = useRecoilValue(viewAtoms.isPatchesView);
  const handleError = useErrorHandler();

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
    ({
      frameNumber,
      frameRate,
      sample,
      urls: rawUrls,
    }: ModalSample["sample"]): T => {
      let constructor:
        | typeof FrameLooker
        | typeof ImageLooker
        | typeof PcdLooker
        | typeof VideoLooker = ImageLooker;

      const mimeType = getMimeType(sample);

      let urls: { [key: string]: string } = {};

      // sometimes the urls are an array of objects, sometimes they are just an object
      // this is a workaround to make sure we can handle both cases
      // todo: investigate why this is the case
      if (Array.isArray(rawUrls)) {
        for (const { field, url } of rawUrls) {
          urls[field] = url;
        }
      } else {
        urls = rawUrls;
      }

      // checking for pcd extension instead of media_type because this also applies for group slices
      // split("?")[0] is to remove query params, if any, from signed urls
      if (urls.filepath?.split("?")[0].endsWith(".pcd")) {
        constructor = PcdLooker;
      } else if (mimeType !== null) {
        const isVideo = mimeType.startsWith("video/");

        if (isVideo && (isFrame || isPatch)) {
          constructor = FrameLooker;
        }

        if (isVideo) {
          constructor = VideoLooker;
        }
      } else {
        constructor = ImageLooker;
      }

      let sampleMediaFilePath = urls[mediaField];

      if (constructor === PcdLooker) {
        const orthographicProjectionField = Object.entries(sample)
          .find(
            (el) => el[1] && el[1]["_cls"] === "OrthographicProjectionMetadata"
          )
          ?.at(0) as string | undefined;
        if (orthographicProjectionField) {
          sampleMediaFilePath = urls[
            `${orthographicProjectionField}.filepath`
          ] as string;
        }
      }

      const config: ConstructorParameters<T>[1] = {
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
        sources: urls,
        frameNumber: constructor === FrameLooker ? frameNumber : undefined,
        frameRate,
        sampleId: sample._id,
        src: getSampleSrc(sampleMediaFilePath),
        support: isClip ? sample["support"] : undefined,
        thumbnail,
        dataset,
        view,
      };

      if (sample.group?.name) {
        config.group = {
          name: sample.group.name,
          id: sample.group._id,
        };
      }

      const looker = new constructor(sample, config, {
        ...options,
        selected: selected.has(sample._id),
        highlight: highlight && highlight(sample),
      });

      looker.addEventListener("error", (event) => {
        handleError(event.error);
      });

      return looker;
    },
    [
      isClip,
      isFrame,
      isPatch,
      options,
      thumbnail,
      mediaField,
      dataset,
      fieldSchema,
      frameFieldSchema,
      handleError,
      highlight,
      selected,
      view,
    ]
  );
  const createLookerRef = useRef(create);

  createLookerRef.current = create;
  return createLookerRef;
};
