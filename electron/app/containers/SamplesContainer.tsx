import React, { useState, useRef } from "react";
import styled from "styled-components";

import { Rail, Sticky } from "semantic-ui-react";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import SidebarContainer from "../components/SidebarContainer";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";

const Container = styled.div`
  .content {
    margin-left: ${({ showSidebar }) => (showSidebar ? "15rem" : undefined)};
  }

  .ui.rail {
    width: unset;
  }
`;

const SamplesContainer = (props) => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [stuck, setStuck] = useState(false);

  const containerRef = useRef();
  const stickyHeaderRef = useRef();

  let headerHeight = 0;
  if (stickyHeaderRef.current && stickyHeaderRef.current.stickyRect) {
    headerHeight = stickyHeaderRef.current.stickyRect.height;
  }

  return (
    <Container ref={containerRef} showSidebar={showSidebar}>
      <Sticky
        ref={stickyHeaderRef}
        context={containerRef}
        onStick={() => setStuck(true)}
        onUnstick={() => setStuck(false)}
      >
        <ViewBar />
        <ImageContainerHeader
          showSidebar={showSidebar}
          onShowSidebar={setShowSidebar}
        />
      </Sticky>
      {showSidebar ? (
        <Rail>
          <Sticky context={containerRef} offset={headerHeight}>
            <DisplayOptionsSidebar tags={[]} labels={[]} scalars={[]} />
          </Sticky>
        </Rail>
      ) : null}
      <div class="content">
        <Samples {...props} />
      </div>
    </Container>
  );
};

export default SamplesContainer;
