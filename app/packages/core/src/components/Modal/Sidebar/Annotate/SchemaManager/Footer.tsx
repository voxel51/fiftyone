import { MuiButton } from "@fiftyone/components";
import React from "react";
import styled from "styled-components";

const Container = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder};
  align-items: center;
  position: absolute;
  bottom: 0;
  padding: 0 2rem;
  height: 64px;
  left: 0;
  background: ${({ theme }) => theme.background.level2};
`;

const Footer = () => {
  return (
    <Container>
      <MuiButton
        variant="outlined"
        color="secondary"
        onClick={() => alert("Cancel")}
      >
        Cancel
      </MuiButton>
      <MuiButton
        variant="contained"
        color="primary"
        onClick={() => alert("Done")}
      >
        Done
      </MuiButton>
    </Container>
  );
};

export default Footer;
