import {
  AbstractLooker,
  type DynamicGroupPoster,
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
import type { ModalSampleExtendedWithImage } from "@fiftyone/looker/src/lookers/imavid/ima-vid-frame-samples";
import type { BaseState, ImaVidConfig } from "@fiftyone/looker/src/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  getMimeType,
  isDirect3dSamplePath,
  isFo3dSamplePath,
  isNativeMediaType,
  isNullish,
} from "@fiftyone/utilities";
import { useEffect, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { dynamicGroupsElementCount, selectedMediaField } from "../recoil";
import { sampleSelectionStyle, selectedSamples } from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import { filters } from "../recoil/filters";
import { groupSlice, hasGroupSlices, modalGroupSlice } from "../recoil/groups";
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
import { useOnShiftClickLabel } from "./useOnShiftClickLabel";

export default <T extends AbstractLooker<BaseState>>(
  isModal: boolean,
  thumbnail: boolean,
  options: Omit<Parameters<T["updateOptions"]>[0], "selected">,
  highlight?: (sample: Sample) => boolean,
  enableTimeline?: boolean,
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

  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE }),
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME }),
  );

  const shouldRenderImaVidLooker = useRecoilValue(
    dynamicGroupAtoms.shouldRenderImaVidLooker(isModal),
  );

  const isDynamicGroup = useRecoilValue(dynamicGroupAtoms.isDynamicGroup);
  const dynamicGroupsTargetFrameRateValue = useRecoilValue(
    dynamicGroupsTargetFrameRate,
  );

  // callback to get the latest promise inside another recoil callback
  // gets around the limitation of the fact that snapshot inside callback refs to the committed state at the time
  const getPromise = useRecoilCallback(
    ({ snapshot: { getPromise } }) => getPromise,
    [],
  );

  useEffect(() => {
    return () => {
      // sending abort signal to clean up all event handlers
      return abortControllerRef.current.abort();
    };
  }, []);

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  const create = useRecoilCallback(
    ({ snapshot }) =>
      (
        { frameNumber, frameRate, sample, urls: rawUrls, symbol },
        extra: Partial<
          Omit<Parameters<T["updateOptions"]>[0], "selected">
        > = {},
      ): T => {
        let create:
          | typeof FrameLooker
          | typeof ImageLooker
          | typeof ImaVidLooker
          | typeof ThreeDLooker
          | typeof VideoLooker
          | typeof MetadataLooker = ImageLooker;

        const mimeType = getMimeType(sample);

        // sometimes the urls are an array of objects, sometimes they are just an object
        // this is a workaround to make sure we can handle both cases
        // todo: investigate why this is the case
        const urls = getNormalizedUrls(rawUrls);

        // split("?")[0] is to remove query params, if any, from signed urls
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
                el[1] && el[1]["_cls"] === "OrthographicProjectionMetadata",
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
            ? (snapshot
                .getLoadable(dynamicGroupAtoms.dynamicGroupCurrentElementIndex)
                .valueMaybe() ?? 1)
            : 1;

          const thisSampleId = sample._id as string;
          // dynamic-group fields (_group value, _group_count) ride on the poster;
          // view it through the shared type instead of ad-hoc inline casts
          const poster = sample as Sample & DynamicGroupPoster;
          // guard rather than assert so a missing field can't silently build the
          // controller from `undefined`
          const groupValue = poster._group ?? "";
          // sample-level caches key on the bare sample `_id` — no media-field or
          // grid/modal suffix — so grid hover and the modal resolve the SAME
          // controller and the modal reuses the frames the grid already buffered
          const imavidPartitionKey = thisSampleId;
          let controller = ImaVidFramesControllerStore.get(imavidPartitionKey);
          if (!controller) {
            // a nested dynamic group's frames span slices; scope the stream to
            // the poster's slice like the relay pager did
            const slice = snapshot
              .getLoadable(isModal ? modalGroupSlice : groupSlice)
              .valueMaybe();
            const sliceFilter =
              slice != null
                ? {
                    group: {
                      slice,
                      ...(snapshot.getLoadable(hasGroupSlices).valueMaybe()
                        ? { slices: [slice] }
                        : {}),
                    },
                  }
                : undefined;

            // playback draws only media + overlays (sidebar values render on
            // settle from the modal's own sample); stream just those paths
            const streamFields = [
              ...(snapshot
                .getLoadable(schemaAtoms.labelPaths({ expanded: false }))
                .valueMaybe() ?? []),
              "tags",
              mediaField,
            ];

            controller = new ImaVidFramesController({
              firstFrameNumber,
              targetFrameRate: dynamicGroupsTargetFrameRateValue,
              datasetId: snapshot.getLoadable(datasetId).valueMaybe() ?? "",
              groupValue,
              view,
              filters: snapshot.getLoadable(filters).valueMaybe() ?? {},
              filter: sliceFilter,
              fields: streamFields,
            });

            // seed the poster frame from already-loaded grid data so the looker
            // renders without a sample fetch; the image is adopted from the
            // tile's own <img> on load (never re-downloaded), the rest streams
            // on play/hover
            if (!controller.store.frameIndex.has(firstFrameNumber)) {
              // synthetic poster seed from grid data: type-check the fields we
              // populate, then assert the full store shape (aspectRatio/typename
              // are absent here and unused by the frame store's consumers)
              const posterSeed: Partial<ModalSampleExtendedWithImage> = {
                id: thisSampleId,
                sample,
                urls: rawUrls,
                image: null,
              };
              controller.store.samples.set(
                thisSampleId,
                posterSeed as ModalSampleExtendedWithImage,
              );
              controller.store.frameIndex.set(firstFrameNumber, thisSampleId);
              controller.store.reverseFrameIndex.set(
                thisSampleId,
                firstFrameNumber,
              );
            }

            ImaVidFramesControllerStore.set(imavidPartitionKey, controller);
          }

          // narrowed so the count closure below is type-safe
          const frameStoreController = controller;

          // seed the group length from the poster's `_group_count` so the timeline shows
          // the real total immediately; a cold modal lacking the field fetches it once
          if (frameStoreController.totalFrameCount == null) {
            const posterGroupCount = poster._group_count;
            (window as { __foImavidDebug?: boolean }).__foImavidDebug &&
              console.debug("[imavid] poster seed", {
                sampleId: thisSampleId,
                group: poster._group,
                posterGroupCount,
                hasGroupCountField: "_group_count" in (sample as object),
              });
            if (posterGroupCount != null) {
              frameStoreController.setTotalFrameCount(posterGroupCount);
            } else if (isModal) {
              getPromise(
                dynamicGroupsElementCount({
                  value: groupValue,
                  modal: true,
                }),
              ).then((count) => frameStoreController.setTotalFrameCount(count));
            }
          }

          config = {
            ...config,
            frameStoreController,
            frameRate: dynamicGroupsTargetFrameRateValue,
            firstFrameNumber: isModal
              ? (snapshot
                  .getLoadable(
                    dynamicGroupAtoms.dynamicGroupCurrentElementIndex,
                  )
                  .valueMaybe() ?? 1)
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
          },
        );

        looker.addEventListener(
          "error",
          (event) => {
            handleError(event.error);
          },
          { signal: abortControllerRef.current.signal },
        );

        selectiveRenderingEventBus.on(
          FO_LABEL_TOGGLED_EVENT,
          (e) => getOnShiftClickLabelCallback(e),
          abortControllerRef.current.signal,
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
    ],
  );

  const createLookerRef = useRef(create);

  createLookerRef.current = create;
  return createLookerRef;
};
