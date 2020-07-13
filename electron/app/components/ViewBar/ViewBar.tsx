import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

const ViewBar = styled.div`
  width: calc(100% - 2.4rem);
  margin: 1rem;
  height: 3rem;
  line-height: 3rem;
  border-radius: 0.2rem;
  border: 0.2rem solid #e0e0e0;
  background-color: #f0f0f0;
`;

export default () => {
  const props = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
  });
  return <ViewBar style={props}>{name}</ViewBar>;
};
