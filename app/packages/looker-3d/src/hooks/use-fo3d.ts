import * as fos from "@fiftyone/state";
import { isWrappableDirect3dSamplePath } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import type { FoScene } from "../fo3d/render-types";
import { buildSyntheticSceneForDirect3dSamples } from "../fo3d/synthetic-scene";
import { getFo3dRoot, getMediaPathForFo3dSample } from "../fo3d/utils";
import type { FiftyoneSceneRawJson } from "../utils";
import useFo3dFetcher from "./use-fo3d-fetcher";
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
  fo3dRoot: string
): FiftyoneSceneRawJson => {
  const normalizedData = cloneRawData(rawData);

  stripPreTransformedAttributes(normalizedData);

  if (normalizedData.background?.image) {
    normalizedData.background.image = getResolvedUrlForFo3dAsset(
      normalizedData.background.image,
      fo3dRoot
    );
  }

  if (normalizedData.background?.cube) {
    normalizedData.background.cube = normalizedData.background.cube.map(
      (cubePath) => getResolvedUrlForFo3dAsset(cubePath, fo3dRoot)
    ) as [string, string, string, string, string, string];
  }

  return normalizedData;
};

type UseFo3dReturnType = {
  foScene: FoScene | null;
  isLoading: boolean;
  fo3dRoot: string;
  rootAssetCount: number;
};

/**
 * Parses the active fo3d sample into a typed scene graph and keeps
 * normalized raw scene content in Recoil for downstream consumers.
 */
export const useFo3d = (sample: fos.ModalSample): UseFo3dReturnType => {
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const isGroup = useRecoilValue(fos.isGroup);
  const active3dSlices = useRecoilValue(fos.active3dSlices);
  const activeSampleMap = useRecoilValue(fos.active3dSlicesToSampleMap);
  const all3dSampleMap = useRecoilValue(fos.all3dSlicesToSampleMap);
  const setFo3dContent = useSetRecoilState(fos.fo3dContent);
  const fetchFo3d = useFo3dFetcher();

  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<FiftyoneSceneRawJson | null>(null);

  const filepath = sample.sample.filepath;
  const fo3dRoot = useMemo(() => getFo3dRoot(filepath), [filepath]);
  const mediaPath = useMemo(
    () => getMediaPathForFo3dSample(sample, mediaField),
    [sample, mediaField]
  );
  const url = useMemo(() => fos.getSampleSrc(mediaPath), [mediaPath]);
  const isWrappableDirectAsset = useMemo(
    () =>
      isWrappableDirect3dSamplePath(mediaPath) ||
      isWrappableDirect3dSamplePath(filepath),
    [mediaPath, filepath]
  );
  const syntheticRawData = useMemo(() => {
    if (!isWrappableDirectAsset) {
      return null;
    }

    const groupedSampleMap =
      isGroup && active3dSlices.length === 0 ? all3dSampleMap : activeSampleMap;

    return buildSyntheticSceneForDirect3dSamples({
      sample,
      mediaField,
      sampleMap: groupedSampleMap,
    });
  }, [
    isWrappableDirectAsset,
    sample,
    mediaField,
    isGroup,
    active3dSlices,
    all3dSampleMap,
    activeSampleMap,
  ]);

  // This effect fetches fo3d data for the active sample and guards stale updates.
  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    setRawData(null);

    if (syntheticRawData || isWrappableDirectAsset) {
      setRawData(syntheticRawData);
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    fetchFo3d(url, filepath).then((response) => {
      if (!isActive) {
        return;
      }

      setRawData(response);
      setIsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [fetchFo3d, url, filepath, syntheticRawData, isWrappableDirectAsset]);

  const normalizedRawData = useMemo(() => {
    if (!rawData) {
      return null;
    }

    return normalizeFo3dRawData(rawData, fo3dRoot);
  }, [rawData, fo3dRoot]);

  // This effect writes normalized fo3d content into Recoil state.
  useEffect(() => {
    if (!normalizedRawData) {
      return;
    }

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
      foScene: null,
      isLoading: true,
      fo3dRoot,
      rootAssetCount: 0,
    };
  }

  return {
    foScene,
    isLoading: false,
    fo3dRoot,
    rootAssetCount,
  };
};
