import {
  AbstractLooker,
  FrameLooker,
  ImaVidLooker,
  ImageLooker,
  Sample,
  ThreeDLooker,
  VideoLooker,
} from "@fiftyone/looker";
import { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import { ImaVidFramesControllerStore } from "@fiftyone/looker/src/lookers/imavid/store";
import type { BaseState, ImaVidConfig } from "@fiftyone/looker/src/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  getFieldInfo,
  getMimeType,
  isNullish,
} from "@fiftyone/utilities";
import { get } from "lodash";
import { useEffect, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRelayEnvironment } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { dynamicGroupsElementCount, selectedMediaField } from "../recoil";
import { selectedSamples } from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as schemaAtoms from "../recoil/schema";
import { datasetName, dynamicGroupsTargetFrameRate } from "../recoil/selectors";
import { State } from "../recoil/types";
import { getSampleSrc } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";
import { getStandardizedUrls } from "../utils";

export default <T extends AbstractLooker<BaseState>>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<Parameters<T["updateOptions"]>[0], "selected">,
  highlight?: (sample: Sample) => boolean,
  enableTimeline?: boolean
) => {
  const abortControllerRef = useRef(new AbortController());
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
    dynamicGroupAtoms.shouldRenderImaVidLooker(isModal)
  );

  const isDynamicGroup = useRecoilValue(dynamicGroupAtoms.isDynamicGroup);
  const dynamicGroupsTargetFrameRateValue = useRecoilValue(
    dynamicGroupsTargetFrameRate
  );

  // callback to get the latest promise inside another recoil callback
  // gets around the limitation of the fact that snapshot inside callback refs to the committed state at the time
  const getPromise = useRecoilCallback(
    ({ snapshot: { getPromise } }) => getPromise,
    []
  );

  useEffect(() => {
    return () => {
      // sending abort signal to clean up all event handlers
      return abortControllerRef.current.abort();
    };
  }, []);

  const create = useRecoilCallback(
    ({ snapshot }) =>
      (
        { frameNumber, frameRate, sample, urls: rawUrls, symbol },
        extra: Partial<Omit<Parameters<T["updateOptions"]>[0], "selected">> = {}
      ): T => {
        let create:
          | typeof FrameLooker
          | typeof ImageLooker
          | typeof ImaVidLooker
          | typeof ThreeDLooker
          | typeof VideoLooker = ImageLooker;

        const mimeType = getMimeType(sample);

        // sometimes the urls are an array of objects, sometimes they are just an object
        // this is a workaround to make sure we can handle both cases
        // todo: investigate why this is the case
        const urls = getStandardizedUrls(rawUrls);

        // split("?")[0] is to remove query params, if any, from signed urls
        const filePath =
          urls.filepath?.split("?")[0] ?? (sample.filepath as string);

        if (filePath.endsWith(".pcd") || filePath.endsWith(".fo3d")) {
          create = ThreeDLooker;
        } else if (mimeType !== null) {
          const isVideo = mimeType.startsWith("video/");

          if (isVideo && (isFrame || isPatch)) {
            create = FrameLooker;
          }

          if (isVideo) {
            create = VideoLooker;
          }

          if (!isVideo && shouldRenderImaVidLooker) {
            create = ImaVidLooker;
          }
        } else {
          create = ImageLooker;
        }

        let config: ConstructorParameters<T>[1] = {
          enableTimeline,
          fieldSchema: {
            frames: {
              name: "frames",
              ftype: LIST_FIELD,
              subfield: EMBEDDED_DOCUMENT_FIELD,
              embeddedDocType: "fiftyone.core.frames.FrameSample",
              fields: frameFieldSchema,
              dbField: null,
            },
            ...fieldSchema,
          },
          sources: urls,
          frameNumber: create === FrameLooker ? frameNumber : undefined,
          frameRate,
          isDynamicGroup,
          sampleId: sample._id,
          support: isClip ? sample.support : undefined,
          dataset,
          mediaField,
          thumbnail,
          view,
          shouldHandleKeyEvents: isModal,
        };

        let sampleMediaFilePath = urls[mediaField];
        if (isNullish(sampleMediaFilePath) && options.mediaFallback === true) {
          sampleMediaFilePath = urls.filepath;
        }

        if (create === ThreeDLooker) {
          config.isFo3d = (sample["filepath"] as string).endsWith(".fo3d");

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
            config.isOpmAvailable = true;
          } else {
            config.isOpmAvailable = false;
          }
        }

        config.src = getSampleSrc(sampleMediaFilePath);

        if (sample.group?.name) {
          config.group = {
            name: sample.group.name,
            id: sample.group._id,
          };
        }

        if (create === ImaVidLooker) {
          const { groupBy } = snapshot
            .getLoadable(dynamicGroupAtoms.dynamicGroupParameters)
            .valueMaybe();
          const groupByKeyFieldInfo = getFieldInfo(groupBy, fieldSchema);
          const groupByFieldValue = get(
            sample,
            groupByKeyFieldInfo.pathWithDbField
          );
          const groupByFieldValueTransformed =
            groupByFieldValue !== null ? String(groupByFieldValue) : null;

          const totalFrameCountPromise = getPromise(
            dynamicGroupsElementCount(groupByFieldValueTransformed)
          );
          const page = snapshot
            .getLoadable(
              dynamicGroupAtoms.dynamicGroupPageSelector({
                value: groupByFieldValueTransformed,
                modal: isModal,
              })
            )
            .valueMaybe();

          const firstFrameNumber = isModal
            ? snapshot
                .getLoadable(dynamicGroupAtoms.dynamicGroupCurrentElementIndex)
                .valueMaybe() ?? 1
            : 1;

          const imavidKey = snapshot
            .getLoadable(
              dynamicGroupAtoms.imaVidStoreKey({
                groupByFieldValue: groupByFieldValueTransformed,
                modal: isModal,
              })
            )
            .valueOrThrow();

          const thisSampleId = sample._id as string;
          const imavidPartitionKey = `${thisSampleId}-${mediaField}`;
          if (!ImaVidFramesControllerStore.has(imavidPartitionKey)) {
            ImaVidFramesControllerStore.set(
              imavidPartitionKey,
              new ImaVidFramesController({
                environment,
                firstFrameNumber,
                page,
                targetFrameRate: dynamicGroupsTargetFrameRateValue,
                totalFrameCountPromise,
                key: imavidKey,
              })
            );
          }

          config = {
            ...config,
            frameStoreController:
              ImaVidFramesControllerStore.get(imavidPartitionKey),
            frameRate: dynamicGroupsTargetFrameRateValue,
            firstFrameNumber: isModal
              ? snapshot
                  .getLoadable(
                    dynamicGroupAtoms.dynamicGroupCurrentElementIndex
                  )
                  .valueMaybe() ?? 1
              : 1,
          } as ImaVidConfig;
        }

        const looker = new create(
          sample,
          { ...config, symbol },
          {
            ...options,
            ...extra,
            selected: selected.has(sample._id),
            highlight: highlight?.(sample),
          }
        );

        looker.addEventListener(
          "error",
          (event) => {
            handleError(event.error);
          },
          { signal: abortControllerRef.current.signal }
        );

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
      isPatch,
      isModal,
      mediaField,
      options,
      shouldRenderImaVidLooker,
      selected,
      thumbnail,
      view,
    ]
  );
  const createLookerRef = useRef(create);

  createLookerRef.current = create;
  return createLookerRef;
};
