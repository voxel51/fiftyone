import React, { useState } from "react";
import styled from "styled-components";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import SidebarContainer from "../components/SidebarContainer";
import Samples from "../components/Samples";

const Container = styled.div``;

const SamplesContainer = (props) => {
  const showSidebar = useState(false);
  return (
    <Container>
      <ImageContainerHeader />
      <SidebarContainer
        sidebar={<DisplayOptionsSidebar tags={[]} labels={[]} scalars={[]} />}
      >
        <Samples {...props} />
      </SidebarContainer>
    </Container>
  );
};

export default SamplesContainer;
