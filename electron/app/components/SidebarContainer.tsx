import React, { useState } from "react";
import styled from "styled-components";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
};

const Container = styled.div`
  display: grid;
  grid-template-columns: ${({ showSidebar }) =>
      showSidebar ? "15rem" : undefined} auto;
`;

const SidebarContainer = ({ sidebar, children }: Props) => {
  const showSidebar = Boolean(sidebar);
  return (
    <Container showSidebar={Boolean(sidebar)}>
      {sidebar || null}
      {children}
    </Container>
  );
};

export default SidebarContainer;
