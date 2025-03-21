import * as fos from "@fiftyone/state";
import { useDebounceCallback } from "@fiftyone/state";
import {
  jotaiStore,
  numConcurrentRenderingLabels,
} from "@fiftyone/state/src/jotai";
import { Autorenew } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import { useSetRecoilState } from "recoil";
import { Button } from "../../utils";

const ShuffleColor: React.FC = () => {
  const setColorSeed = useSetRecoilState(fos.colorSeed);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    const unsubscribe = jotaiStore.sub(numConcurrentRenderingLabels, () => {
      const count = jotaiStore.get(numConcurrentRenderingLabels);
      setIsRendering(count > 0);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const debouncedShuffle = useDebounceCallback(() => {
    if (!isRendering) {
      setColorSeed((s) => s + 1);
    }
  }, 200);

  return (
    <>
      <Button
        text={
          <span style={{ display: "flex", justifyContent: "center" }}>
            {isRendering ? "Rendering labels..." : "Shuffle all field colors"}
            {!isRendering && (
              <Autorenew
                style={{
                  marginLeft: "0.25rem",
                  color: "inherit",
                }}
              />
            )}
          </span>
        }
        onClick={debouncedShuffle}
        data-cy="shuffle-colors"
        disabled={isRendering}
        style={{
          margin: "0.25rem -0.5rem",
          height: "2rem",
          textAlign: "center",
          flex: 1,
          width: "200px",
          opacity: isRendering ? 0.5 : 1,
        }}
      ></Button>
    </>
  );
};

export default ShuffleColor;
