import React, { useState } from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

const ViewStageParameterDiv = styled.div``;

const ViewStageParameter = () => {
  return <ViewStageParameterDiv />;
};

const ViewStageDiv = styled.div`
  background-color: var(--bg);
  border-color: var(--std-border-color);
  border-radius: 0.2rem;
  border-width: 0.2rem;
  box-sizing: border-box;
  height: 3rem;
  line-height: 3rem;
  width: 100%;
`;

export default ({ name, parameters, empty }) => {
  const isActive = useState(false);

  const props = useSpring({
    borderStyle: isActive ? "dashed" : "solid",
  });

  return (
    <ViewStageDiv style={props}>
      {empty ? <div>empty</div> : <div>populated</div>}
    </ViewStageDiv>
  );
};
