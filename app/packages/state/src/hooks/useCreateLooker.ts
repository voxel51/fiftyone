import {
  AbstractLooker,
  FO_LABEL_TOGGLED_EVENT,
  FrameLooker,
  ImaVidLooker,
  ImageLooker,
  MetadataLooker,
  Sample,
  ThreeDLooker,
  VideoLooker,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import { ImaVidFramesControllerStore } from "@fiftyone/looker/src/lookers/imavid/store";
import type { BaseState, ImaVidConfig } from "@fiftyone/looker/src/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  getMimeType,
  isDirect3dSamplePath,
  isFo3dSamplePath,
  isNativeMediaType,
  isNullish,
  Schema,
} from "@fiftyone/utilities";
import { useEffect, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { dynamicGroupsElementCount, selectedMediaField } from "../recoil";
import { sampleSelectionStyle, selectedSamples } from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import { filters } from "../recoil/filters";
import type { ModalSample } from "../recoil/modal";
import { gridSampleFields } from "../recoil/sampleProjection";
import * as schemaAtoms from "../recoil/schema";
import {
  datasetId,
  datasetName,
  dynamicGroupsTargetFrameRate,
} from "../recoil/selectors";
import { State } from "../recoil/types";
import { getSampleSrc, resolveSelectionIcon } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";
import { getNormalizedUrls } from "../utils";
import { stores } from "./useLookerStore";
import { useOnShiftClickLabel } from "./useOnShiftClickLabel";

// Read-through view over every looker store's sample cache so imavid frames keyed
// by `_id` are reused whether the grid or the modal populated them.
const sharedSampleCache = {
  get: (id: string): ModalSample | undefined => {
    for (const store of stores) {
      const cached = store.samples.get(id);
      if (cached) {
        return cached;
      }
    }
    return undefined;
  },
} as unknown as Map<string, ModalSample>;

export default <T extends AbstractLooker<BaseState>>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<Parameters<T["updateOptions"]>[0], "selected">,
  highlight?: (sample: Sample) => boolean,
  enableTimeline?: boolean,
  sampleSchema?: Schema
) => {
  const abortControllerRef = useRef(new AbortController());
  const selected = useRecoilValue(selectedSamples);
  const style = useRecoilValue(sampleSelectionStyle);
  const isClip = useRecoilValue(viewAtoms.isClipsView);
  const isFrame = useRecoilValue(viewAtoms.isFramesView);
  const isPatch = useRecoilValue(viewAtoms.isPatchesView);
  const handleError = useErrorHandler();

  const view = useRecoilValue(viewAtoms.view);
  const dataset = useRecoilValue(datasetName);
  const mediaField = useRecoilValue(selectedMediaField(isModal));
  // grid's media field keys the shared imavid controller so the modal reuses its buffered frames
  const sharedMediaField = useRecoilValue(selectedMediaField(false));

  const fieldSchema =
    sampleSchema ??
    useRecoilValue(schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE }));
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

  useEffect(() => {
    return () => {
      return abortControllerRef.current.abort();
    };
  }, []);

  // fresh-snapshot getter so a promise resolved inside the create callback reflects
  // current state, not the callback's committed snapshot
  const getPromise = useRecoilCallback(
    ({ snapshot: { getPromise } }) => getPromise,
    []
  );

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

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
          | typeof VideoLooker
          | typeof MetadataLooker = ImageLooker;

        const mimeType = getMimeType(sample);

        // urls may be an array of objects or a single object; normalize both
        // todo: investigate why this is the case
        const urls = getNormalizedUrls(rawUrls);

        // strip query params from signed urls
        const filePath =
          urls.filepath?.split("?")[0] ?? (sample.filepath as string);
        const mediaFieldPath = urls[mediaField];
        const isDirect3dSample =
          isDirect3dSamplePath(filePath) ||
          isDirect3dSamplePath(mediaFieldPath);

        if (
          !isNativeMediaType(sample.media_type ?? sample._media_type) &&
          !isDirect3dSample
        ) {
          create = MetadataLooker;
        } else {
          if (isDirect3dSample) {
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
          frameNumber:
            create === FrameLooker
              ? frameNumber ?? (sample.frame_number as number | undefined)
              : undefined,
          // frame_rate lives in the sample's metadata
          frameRate:
            frameRate ??
            (sample.metadata as { frame_rate?: number } | undefined)
              ?.frame_rate,
          isDynamicGroup,
          sampleId: sample._id,
          support: isClip ? sample.support : undefined,
          dataset,
          mediaField,
          thumbnail,
          view,
          shouldHandleKeyEvents: isModal,
          isModal,
        };

        let sampleMediaFilePath = urls[mediaField];
        if (isNullish(sampleMediaFilePath) && options.mediaFallback === true) {
          sampleMediaFilePath = urls.filepath;
        }

        if (create === ThreeDLooker) {
          const sampleFilepath = sample["filepath"];
          config.isFo3d =
            isFo3dSamplePath(sampleFilepath) ||
            isFo3dSamplePath(sampleMediaFilePath);

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
          const firstFrameNumber = isModal
            ? snapshot
                .getLoadable(dynamicGroupAtoms.dynamicGroupCurrentElementIndex)
                .valueMaybe() ?? 1
            : 1;

          const thisSampleId = sample._id as string;
          const imavidPartitionKey = `${thisSampleId}-${sharedMediaField}`;
          let controller = ImaVidFramesControllerStore.get(imavidPartitionKey);
          if (!controller) {
            controller = new ImaVidFramesController({
              firstFrameNumber,
              targetFrameRate: dynamicGroupsTargetFrameRateValue,
              datasetId: snapshot.getLoadable(datasetId).valueMaybe() ?? "",
              groupValue: sample._group as string,
              view,
              filters: snapshot.getLoadable(filters).valueMaybe() ?? {},
              fields: snapshot.getLoadable(gridSampleFields).valueMaybe() ?? [],
              sharedSamples: sharedSampleCache,
            });

            // seed the poster frame from already-loaded grid data so the looker
            // renders without a sample fetch; the rest streams on play/hover
            if (!controller.store.frameIndex.has(firstFrameNumber)) {
              controller.store.samples.set(thisSampleId, {
                id: thisSampleId,
                sample,
                urls: rawUrls,
                image: null,
              } as never);
              controller.store.frameIndex.set(firstFrameNumber, thisSampleId);
              controller.store.reverseFrameIndex.set(
                thisSampleId,
                firstFrameNumber
              );
              void controller.store.fetchImageForSample(
                thisSampleId,
                rawUrls,
                mediaField
              );
            }

            ImaVidFramesControllerStore.set(imavidPartitionKey, controller);
          }

          // narrowed so the count closure below is type-safe
          const frameStoreController = controller;

          // seed the group length from the poster's `_group_count` so the timeline shows
          // the real total immediately; a cold modal lacking the field fetches it once
          if (frameStoreController.totalFrameCount == null) {
            const posterGroupCount = (sample as { _group_count?: number })
              ._group_count;
            if (posterGroupCount != null) {
              frameStoreController.setTotalFrameCount(posterGroupCount);
            } else if (isModal) {
              getPromise(
                dynamicGroupsElementCount({ value: sample._group, modal: true })
              ).then((count) => frameStoreController.setTotalFrameCount(count));
            }
          }

          config = {
            ...config,
            frameStoreController,
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

        const isSelected = selected.has(sample._id);
        const {
          selectionType: sampleSelectionType,
          selectionIcon: sampleSelectionIcon,
        } = resolveSelectionIcon(selected, style, sample._id, isSelected);

        const looker = new create(
          sample,
          { ...config, symbol },
          {
            ...options,
            ...extra,
            selected: isSelected,
            selectionType: sampleSelectionType,
            selectionIcon: sampleSelectionIcon,
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

        selectiveRenderingEventBus.on(
          FO_LABEL_TOGGLED_EVENT,
          (e) => getOnShiftClickLabelCallback(e),
          abortControllerRef.current.signal
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
      style,
      thumbnail,
      view,
      getOnShiftClickLabelCallback,
    ]
  );

  const createLookerRef = useRef(create);

  createLookerRef.current = create;
  return createLookerRef;
};
