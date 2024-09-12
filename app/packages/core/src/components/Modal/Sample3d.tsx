import { Loading } from "@fiftyone/components";
import { Looker3d } from "@fiftyone/looker-3d/src/Looker3d";
import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SampleWrapper } from "./Sample2D";

const Sample3dContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

export const Sample3d = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <Sample3dContainer data-cy="modal-looker-container">
        {isGroup ? (
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
