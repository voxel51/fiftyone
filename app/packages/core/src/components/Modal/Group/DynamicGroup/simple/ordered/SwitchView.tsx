import React from "react";

import { TabOption } from "@fiftyone/components";
import styled from "styled-components";

const SwitchViewContainer = styled.div`
  width: 50%;
  margin: 0.5em;
  display: flex;
  align-self: center;
  align-items: center;
  justify-content: center;
`;

interface SwitchViewProps {
  shouldRenderVideoLooker: boolean;
  setShouldRenderVideoLooker: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SwitchView = ({
  shouldRenderVideoLooker,
  setShouldRenderVideoLooker,
}: SwitchViewProps) => {
  return (
    <SwitchViewContainer>
      <TabOption
        style={{ width: "100%" }}
        active={shouldRenderVideoLooker ? "Video" : "Carousel"}
        options={[
          {
            text: "Carousel",
            title: "Carousel",
            onClick: () => {
              setShouldRenderVideoLooker(false);
            },
          },
          {
            text: "Video",
            title: "Video",
            onClick: () => {
              setShouldRenderVideoLooker(true);
            },
          },
        ]}
      />
    </SwitchViewContainer>
  );
};
