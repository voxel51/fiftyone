import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";

import { numViewStages } from "../../../recoil/selectors";
import { SearchResults } from "semantic-ui-react";

const ViewStageParameterDiv = styled.div``;

const ViewStageParameter = () => {
  return <ViewStageParameterDiv />;
};

const ViewStageDiv = animated(styled.div`
  background-color: var(--bg);
  border-color: var(--std-border-color);
  border-radius: var(--std-border-radius);
  border-width: var(--std-border-width);
  box-sizing: border-box;
  display: inline-block;
  line-height: 1.5rem;
  margin: 0.25rem;
  padding: 0 0.5rem;
`);

export default ({ key, name, parameters, empty }) => {
  const numViewStagesValue = useRecoilValue(numViewStages);
  const isActive = useState(false);
  alert(key);

  const props = useSpring({
    borderStyle: isActive ? "dashed" : "solid",
  });

  return (
    <ViewStageDiv style={props}>
      {empty ? <div>empty</div> : <div>populated</div>}
    </ViewStageDiv>
  );
};
