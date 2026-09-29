import { LoadingDots } from "@fiftyone/components";
import ResourceCount from "@fiftyone/core/src/components/ResourceCount";
import { Suspense } from "react";
import { RightContainer, RightDiv, SamplesHeader } from "./Containers";
import GridHeaderSampleRendererControls from "./GridHeaderSampleRendererControls";
import RelayoutDemoButton from "./RelayoutDemoButton";
import Sentence from "./Sentence";
import Settings from "./Settings";

const Header = () => (
  <SamplesHeader data-cy={"fo-grid-actions"}>
    <Sentence />
    <RightContainer key={"options"}>
      <Suspense
        fallback={
          <RightDiv>
            <LoadingDots />
          </RightDiv>
        }
      >
        <ResourceCount />
      </Suspense>
      <GridHeaderSampleRendererControls />
      <RelayoutDemoButton />
      <Settings />
    </RightContainer>
  </SamplesHeader>
);

export default Header;
