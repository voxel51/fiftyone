import React, { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { useService } from "@xstate/react";

import SearchResults from "./SearchResults";

const ViewStageParameterDiv = styled.div``;

const ViewStageParameterInput = styled.input``;

export default ({ parameterRef }) => {
  const [state, send] = useService(parameterRef);
  const inputRef = useRef(null);
  const { id, stage, parameter, value } = state.context;

  useEffect(() => {
    parameterRef.execute(state, {
      focusInput() {
        inputRef.current && inputRef.current.select();
      },
    });
  }, [state, parameterRef]);

  return (
    <ViewStageParameterDiv>
      <ViewStageParameterInput placeholder={parameter} />
    </ViewStageParameterDiv>
  );
};
