import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import Logo from "../images/logo.png";

const LogoImg = animated(styled.img`
  width: 4rem;
  height: 4rem;
  margin: auto;
  display: block;
  transform-origin: 50% 50%;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
`);

const Container = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
`;

const Text = styled.div`
  padding-top: 1rem;
  font-weight: bold;
  text-align: center;

  & a {
    color: ${({ theme }) => theme.brand};
    text-decoration: underline;
    cursor: pointer;
  }
`;

const Loading = React.memo(
  ({
    text = null,
    onClick = null,
  }: {
    text?: string;
    onClick?: (e: MouseEvent) => void;
  }) => {
    const [resetOrbit, setResetOrbit] = useState(false);
    const props = useSpring({
      from: { transform: "rotate(0deg)" },
      transform: "rotate(360deg)",
      onRest: () => setResetOrbit((state) => !state),
      reset: resetOrbit,
      config: {
        duration: 3000,
      },
    });
    const rest = onClick
      ? {
          onClick,
        }
      : {};
    return (
      <Container>
        <div
          style={{
            margin: "auto",
            width: "100%",
            cursor: onClick ? "pointer" : "default",
          }}
          {...rest}
        >
          <LogoImg style={props} src={Logo} />
          {text && <Text>{text}</Text>}
        </div>
      </Container>
    );
  }
);

export default Loading;
