import * as fos from "@fiftyone/state";
import {
  getSamplePathExtension,
  isFo3dSamplePath,
  isWrappableDirect3dSamplePath,
} from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import type { FoScene } from "../fo3d/render-types";
import type { DirectPcdWorldTransforms } from "../fo3d/direct-pcd-world-alignment";
import {
  buildSyntheticSceneForDirect3dSamples,
  buildSyntheticSceneNodesForDirect3dSamples,
} from "../fo3d/synthetic-scene";
import { getFo3dRoot, getMediaPathForFo3dSample } from "../fo3d/utils";
import type { FiftyoneSceneRawJson } from "../utils";
import useFo3dFetcher from "./use-fo3d-fetcher";
import { useGroupedDirectPcdWorldTransforms } from "./use-grouped-direct-pcd-world-transforms";
import { buildFoScene, getRootAssetCount } from "./use-fo3d-scene-parser";

import { getResolvedUrlForFo3dAsset } from "../fo3d/utils";
import type { FoSceneRawNode } from "../utils";

const cloneRawData = (rawData: FiftyoneSceneRawJson): FiftyoneSceneRawJson => {
  if (typeof structuredClone === "function") {
    return structuredClone(rawData);
  }

  return JSON.parse(JSON.stringify(rawData)) as FiftyoneSceneRawJson;
};

const stripPreTransformedAttributes = (node: FoSceneRawNode) => {
  for (const key of Object.keys(node)) {
    if (key.startsWith("preTransformed")) {
      delete node[key as keyof FoSceneRawNode];
    }
  }

  node.children?.forEach(stripPreTransformedAttributes);
};

const normalizeFo3dRawData = (
  rawData: FiftyoneSceneRawJson,
  fo3dRoot: string | null,
): FiftyoneSceneRawJson => {
  const normalizedData = cloneRawData(rawData);

  stripPreTransformedAttributes(normalizedData);

  if (fo3dRoot && normalizedData.background?.image) {
    normalizedData.background.image = getResolvedUrlForFo3dAsset(
      normalizedData.background.image,
      fo3dRoot,
    );
  }

  if (fo3dRoot && normalizedData.background?.cube) {
    normalizedData.background.cube = normalizedData.background.cube.map(
      (cubePath) => getResolvedUrlForFo3dAsset(cubePath, fo3dRoot),
    ) as [string, string, string, string, string, string];
  }

  return normalizedData;
};

const getSampleMapForSlices = (
  sampleMap: Record<string, fos.ModalSample>,
  slices: string[],
) => {
  return Object.fromEntries(
    slices
      .map((slice) => [slice, sampleMap[slice]] as const)
      .filter(([, currentSample]) => Boolean(currentSample)),
  );
};

/**
 * Appends active direct-3D slices onto an existing FO3D scene definition.
 */
export const appendDirect3dSamplesToScene = ({
  mediaField,
  rawData,
  sampleMap,
}: {
  mediaField: string;
  rawData: FiftyoneSceneRawJson;
  sampleMap: Record<string, fos.ModalSample>;
}) => {
  const sampleEntries = Object.entries(sampleMap);

  if (!sampleEntries.length) {
    return rawData;
  }

  const syntheticChildren = buildSyntheticSceneNodesForDirect3dSamples({
    sample: sampleEntries[0][1],
    mediaField,
    sampleMap,
  });

  if (!syntheticChildren.length) {
    return rawData;
  }

  const mergedRawData = cloneRawData(rawData);
  mergedRawData.children = [
    ...(mergedRawData.children ?? []),
    ...syntheticChildren,
  ];

  return mergedRawData;
};

type UseFo3dReturnType = {
  directPcdWorldTransformsBySampleId: DirectPcdWorldTransforms;
  foScene: FoScene | null;
  isLoading: boolean;
  loadError: Error | null;
  fo3dRoot: string | null;
  rootAssetCount: number;
};

/**
 * Parses the active fo3d sample into a typed scene graph and keeps
 * normalized raw scene content in Recoil for downstream consumers.
 */
export const useFo3d = (sample: fos.ModalSample): UseFo3dReturnType => {
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const isGroup = useRecoilValue(fos.isGroup);
  const group3dState = fos.useRenderConfig3dState();
  const { setFo3dContent } = fos.useRenderConfig3dActions();
  const fetchFo3d = useFo3dFetcher();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [rawData, setRawData] = useState<FiftyoneSceneRawJson | null>(null);

  const filepath = sample.sample.filepath;
  const mediaPath = useMemo(
    () => getMediaPathForFo3dSample(sample, mediaField),
    [sample, mediaField],
  );
  const isRealFo3dScene = useMemo(
    () => isFo3dSamplePath(mediaPath) || isFo3dSamplePath(filepath),
    [mediaPath, filepath],
  );
  const fo3dPath = useMemo(
    () => (isFo3dSamplePath(mediaPath) ? mediaPath : filepath),
    [mediaPath, filepath],
  );
  const fo3dRoot = useMemo(
    () => (isRealFo3dScene ? getFo3dRoot(fo3dPath) : null),
    [fo3dPath, isRealFo3dScene],
  );
  const url = useMemo(() => fos.getSampleSrc(mediaPath), [mediaPath]);
  const isWrappableDirectAsset = useMemo(
    () =>
      isWrappableDirect3dSamplePath(mediaPath) ||
      isWrappableDirect3dSamplePath(filepath),
    [mediaPath, filepath],
  );
  const groupedDirectSampleMap = useMemo(() => {
    if (!isGroup) {
      return undefined;
    }

    if (group3dState.activeSlices.length) {
      return getSampleMapForSlices(
        group3dState.allSampleMap,
        group3dState.activeDirectSlices,
      );
    }

    const realFo3dSliceSet = new Set(group3dState.realFo3dSlices);
    return Object.fromEntries(
      Object.entries(group3dState.allSampleMap).filter(
        ([slice]) => !realFo3dSliceSet.has(slice),
      ),
    );
  }, [
    group3dState.activeDirectSlices,
    group3dState.activeSlices,
    group3dState.allSampleMap,
    isGroup,
    group3dState.realFo3dSlices,
  ]);
  const groupedDirectPcdSampleMap = useMemo(() => {
    if (!groupedDirectSampleMap) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(groupedDirectSampleMap).filter(([, currentSample]) => {
        const path =
          getMediaPathForFo3dSample(currentSample, mediaField) ??
          currentSample.sample.filepath;
        return getSamplePathExtension(path)?.toLowerCase() === ".pcd";
      }),
    );
  }, [groupedDirectSampleMap, mediaField]);
  const directPcdSliceNames = useMemo(
    () => Object.keys(groupedDirectPcdSampleMap),
    [groupedDirectPcdSampleMap],
  );
  const directPcdAlignment = useGroupedDirectPcdWorldTransforms({
    enabled:
      isGroup &&
      !group3dState.activeFo3dSlice &&
      directPcdSliceNames.length > 0,
    sampleId: sample.sample._id ?? null,
    sliceNames: directPcdSliceNames,
  });
  const directPcdWorldTransformsBySampleId = useMemo(() => {
    const transforms: Record<string, DirectPcdWorldTransforms[string]> = {};

    for (const [slice, currentSample] of Object.entries(
      groupedDirectPcdSampleMap,
    )) {
      const transform = directPcdAlignment.transformsBySlice[slice];
      const sampleId = currentSample.sample._id;
      if (transform && sampleId) {
        transforms[sampleId] = transform;
      }
    }

    return transforms;
  }, [directPcdAlignment.transformsBySlice, groupedDirectPcdSampleMap]);
  const syntheticRawData = useMemo(() => {
    if (group3dState.activeFo3dSlice || !isWrappableDirectAsset) {
      return null;
    }

    const groupedSampleMap =
      isGroup && group3dState.activeSlices.length === 0
        ? groupedDirectSampleMap
        : group3dState.activeSampleMap;

    return buildSyntheticSceneForDirect3dSamples({
      sample,
      mediaField,
      sampleMap: groupedSampleMap,
      worldTransformsBySlice: directPcdAlignment.transformsBySlice,
    });
  }, [
    group3dState.activeFo3dSlice,
    group3dState.activeSampleMap,
    group3dState.activeSlices,
    isWrappableDirectAsset,
    isGroup,
    groupedDirectSampleMap,
    mediaField,
    sample,
    directPcdAlignment.transformsBySlice,
  ]);

  // This effect fetches fo3d data for the active sample and guards stale updates.
  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    setLoadError(null);
    setRawData(null);

    if (directPcdAlignment.isLoading) {
      return () => {
        isActive = false;
      };
    }

    if (directPcdAlignment.error) {
      setLoadError(directPcdAlignment.error);
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    if (isRealFo3dScene) {
      fetchFo3d(url, fo3dPath)
        .then((response) => {
          if (!isActive) {
            return;
          }

          const mergedResponse = groupedDirectSampleMap
            ? appendDirect3dSamplesToScene({
                mediaField,
                rawData: response,
                sampleMap: groupedDirectSampleMap,
              })
            : response;

          setRawData(mergedResponse);
          setLoadError(null);
          setIsLoading(false);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          console.error("Failed to fetch fo3d scene:", error);
          setRawData(null);
          setLoadError(
            error instanceof Error ? error : new Error(String(error)),
          );
          setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }

    if (syntheticRawData || isWrappableDirectAsset) {
      setRawData(syntheticRawData);
      setLoadError(null);
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setRawData(null);
    setLoadError(null);
    setIsLoading(false);

    return () => {
      isActive = false;
    };
  }, [
    fetchFo3d,
    directPcdAlignment.error,
    directPcdAlignment.isLoading,
    fo3dPath,
    filepath,
    groupedDirectSampleMap,
    isRealFo3dScene,
    isWrappableDirectAsset,
    mediaField,
    syntheticRawData,
    url,
  ]);

  const normalizedRawData = useMemo(() => {
    if (!rawData) {
      return null;
    }

    return normalizeFo3dRawData(rawData, fo3dRoot);
  }, [rawData, fo3dRoot]);

  // This effect writes normalized fo3d content into Recoil state.
  useEffect(() => {
    setFo3dContent(normalizedRawData);
  }, [normalizedRawData, setFo3dContent]);

  const foScene = useMemo(() => {
    if (!normalizedRawData) {
      return null;
    }

    return buildFoScene(normalizedRawData);
  }, [normalizedRawData]);

  const rootAssetCount = useMemo(() => getRootAssetCount(foScene), [foScene]);

  if (isLoading) {
    return {
      directPcdWorldTransformsBySampleId: {},
      foScene: null,
      isLoading: true,
      loadError: null,
      fo3dRoot,
      rootAssetCount: 0,
    };
  }

  return {
    directPcdWorldTransformsBySampleId,
    foScene,
    isLoading: false,
    loadError,
    fo3dRoot,
    rootAssetCount,
  };
};
