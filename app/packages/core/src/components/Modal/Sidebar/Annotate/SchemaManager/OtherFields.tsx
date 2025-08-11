import { Typography } from "@mui/material";
import React from "react";
import styled from "styled-components";
import { RoundButton } from "../Actions";
import FieldRow from "./FieldRow";
import Footer from "./Footer";
import { Header } from "./Modal";

const Container = styled.div`
  flex: 1;
  position: relative;
  overflow-y: auto;
  margin-bottom: 34px;
`;

const OtherFields = () => {
  return (
    <>
      <Header>
        <Typography color="secondary" padding="1rem 0">
          0 selected
        </Typography>
        <RoundButton>Select all</RoundButton>
      </Header>
      <Container>
        <FieldRow />
      </Container>
      <Footer />
    </>
  );
};

export default OtherFields;
