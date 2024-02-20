import { useLayoutEffect, useState } from "react";
import { Box3, Group } from "three";

const BOUNDING_BOX_POLLING_INTERVAL = 50;

export const useFoSceneBounds = (assetsGroupRef: React.RefObject<Group>) => {
  const [sceneBoundingBox, setSceneBoundingBox] = useState<Box3>(null);

  useLayoutEffect(() => {
    const getBoundingBox = () => {
      if (!assetsGroupRef.current) {
        setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
        return;
      }

      const box = new Box3().setFromObject(assetsGroupRef.current);
      if (Math.abs(box.max?.x) === Infinity) {
        setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
      } else {
        setSceneBoundingBox(box);
      }
    };

    // this is a hack, yet to find a robust way to know when the scene is done loading
    // callbacks in loaders are not reliable
    // check every 50ms for scene's bounding box
    setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
  }, [assetsGroupRef]);

  return sceneBoundingBox;
};
