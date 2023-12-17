import {
  AbstractLooker,
  FrameLooker,
  ImaVidLooker,
  ImageLooker,
  PcdLooker,
  AudioLooker,
  Sample,
  VideoLooker,
} from "@fiftyone/looker";
import { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import { ImaVidFramesControllerStore } from "@fiftyone/looker/src/lookers/imavid/store";
import { ImaVidConfig } from "@fiftyone/looker/src/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  getMimeType,
} from "@fiftyone/utilities";
import { get } from "lodash";
import { useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRelayEnvironment } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  ModalSample,
  dynamicGroupsElementCount,
  selectedMediaField,
} from "../recoil";
import { selectedSamples } from "../recoil/atoms";
import * as groupAtoms from "../recoil/groups";
import * as schemaAtoms from "../recoil/schema";
import { datasetName } from "../recoil/selectors";
import { State } from "../recoil/types";
import { getSampleSrc, getSanitizedGroupByExpression } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";
import { getStandardizedUrls } from "../utils";

export default <T extends AbstractLooker>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<Parameters<T["updateOptions"]>[0], "selected">,
  highlight?: (sample: Sample) => boolean
) => {
  const environment = useRelayEnvironment();
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

  const shouldRenderImaVidLooker = useRecoilValue(
    groupAtoms.shouldRenderImaVidLooker
  );

  // callback to get the latest promise inside another recoil callback
  // gets around the limitation of the fact that snapshot inside callback refs to the committed state at the time
  const getPromise = useRecoilCallback(
    ({ snapshot: { getPromise } }) => getPromise,
    []
  );

  const create = useRecoilCallback(
    ({ snapshot }) =>
      ({
        frameNumber,
        frameRate,
        sample,
        urls: rawUrls,
      }: ModalSample["sample"]): T => {
        let constructor:
          | typeof FrameLooker
          | typeof ImageLooker
          | typeof ImaVidLooker
          | typeof PcdLooker
          | typeof AudioLooker
          | typeof VideoLooker = ImageLooker;

        const mimeType = getMimeType(sample);

        // sometimes the urls are an array of objects, sometimes they are just an object
        // this is a workaround to make sure we can handle both cases
        // todo: investigate why this is the case
        const urls = getStandardizedUrls(rawUrls);

        // checking for pcd extension instead of media_type because this also applies for group slices
        // split("?")[0] is to remove query params, if any, from signed urls
        if (urls.filepath?.split("?")[0].endsWith(".pcd")) {
          constructor = PcdLooker;
        } else if (urls.filepath?.split("?")[0].endsWith(".wav")){
          constructor = AudioLooker
        }else if (mimeType !== null) {
          const isVideo = mimeType.startsWith("video/");

          if (isVideo && (isFrame || isPatch)) {
            constructor = FrameLooker;
          }

          if (isVideo) {
            constructor = VideoLooker;
          }

          if (!isVideo && shouldRenderImaVidLooker) {
            constructor = ImaVidLooker;
          }
        } else {
          constructor = ImageLooker;
        }

        let sampleMediaFilePath = urls[mediaField];

        if (constructor === PcdLooker) {
          const orthographicProjectionField = Object.entries(sample)
            .find(
              (el) =>
                el[1] && el[1]["_cls"] === "OrthographicProjectionMetadata"
            )
            ?.at(0) as string | undefined;
          if (orthographicProjectionField) {
            sampleMediaFilePath = urls[
              `${orthographicProjectionField}.filepath`
            ] as string;
          }
        }

        if (constructor === AudioLooker) {
          const spectogramField = Object.entries(sample)
            .find(
              (el) =>
                el[1] && el[1]["_cls"] === "SpectogramMetadata"
            )
            ?.at(0) as string | undefined;
          if (spectogramField) {
            sampleMediaFilePath = urls[
              `${spectogramField}.spec_path`
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
          dataset,
          mediaField,
          thumbnail,
          view,
        };

        if (sample.group?.name) {
          config.group = {
            name: sample.group.name,
            id: sample.group._id,
          };
        }

        if (constructor === ImaVidLooker) {
          const { groupBy, orderBy } = snapshot
            .getLoadable(groupAtoms.dynamicGroupParameters)
            .valueMaybe();
          const groupByFieldValue = get(
            sample,
            getSanitizedGroupByExpression(groupBy)
          ) as string;
          const totalFrameCountPromise = getPromise(
            dynamicGroupsElementCount(groupByFieldValue)
          );
          const page = snapshot
            .getLoadable(groupAtoms.dynamicGroupPageSelector(groupByFieldValue))
            .valueMaybe();

          const thisSampleId = sample._id as string;
          if (!ImaVidFramesControllerStore.has(thisSampleId)) {
            ImaVidFramesControllerStore.set(
              thisSampleId,
              new ImaVidFramesController({
                environment,
                orderBy,
                page,
                totalFrameCountPromise,
                posterSample: sample,
              })
            );
          }

          (config as ImaVidConfig).frameStoreController = (
            config as ImaVidConfig
          ).frameStoreController =
            ImaVidFramesControllerStore.get(thisSampleId);

          // todo
          (config as ImaVidConfig).frameRate = 24;
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
      dataset,
      fieldSchema,
      frameFieldSchema,
      handleError,
      highlight,
      isClip,
      isFrame,
      shouldRenderImaVidLooker,
      isPatch,
      mediaField,
      options,
      selected,
      thumbnail,
      view,
    ]
  );
  const createLookerRef = useRef(create);

  createLookerRef.current = create;
  return createLookerRef;
};
