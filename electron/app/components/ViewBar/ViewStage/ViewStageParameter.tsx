import React from "react";

import { SearchResults } from "./SearchResults";

const ViewStageParameterDiv = styled.div``;

const ViewStageParameter = ({ stage, parameter }) => {
  return (
    <ViewStageParameterDiv>
      <input placeholder={parameter} />
    </ViewStageParameterDiv>
  );
};
