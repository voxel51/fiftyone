import { Loading } from "@fiftyone/components";
import { Looker3d } from "@fiftyone/looker-3d/src/Looker3d";
import * as fos from "@fiftyone/state";
import { modalMode } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SampleWrapper } from "./Sample2D";
import useCanAnnotate from "./Sidebar/Annotate/useCanAnnotate";

const Sample3dContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

export const Sample3d = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);
  const canAnnotate = useCanAnnotate();
  const isInAnnotateMode = useAtomValue(modalMode) === "annotate";

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <Sample3dContainer data-cy="modal-looker-container">
        {isGroup || (canAnnotate && isInAnnotateMode) ? (
          <Looker3d />
        ) : (
          <SampleWrapper>
            <Looker3d />
          </SampleWrapper>
        )}
      </Sample3dContainer>
    </Suspense>
  );
});
