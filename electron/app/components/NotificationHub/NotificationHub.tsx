import React, { useContext, useEffect, useState } from "react";
import { animated, useTransition } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { Close } from "@material-ui/icons";

const Container = styled("div")`
  position: fixed;
  z-index: 10000;
  width: 0 auto;
  top: ${(props) => (props.top ? "2em" : "unset")};
  bottom: ${(props) => (props.top ? "unset" : "2em")};
  margin: 0 auto;
  left: 2em;
  right: 2em;
  font-weight: bold;
  display: flex;
  flex-direction: ${(props) => (props.top ? "column-reverse" : "column")};
  align-items: ${(props) =>
    props.position === "center" ? "center" : `flex-${props.position || "end"}`};
  @media (max-width: 680px) {
    align-items: center;
  }
`;

const Message = styled(animated.div)`
  margin-top: 1em;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  width: 40ch;
  @media (max-width: 680px) {
    width: 100%;
  }
`;

const MessageText = styled.p`
  margin-bottom: 1.5em;
  color: ${({ theme }) => theme.fontDark};
`;

const MessageTitle = styled.h3`
  font-size: 1.5em;
  color: ${({ theme }) => theme.font};
`;

const Content = styled.div`
  color: ${({ theme }) => theme.font};
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  box-shadow: 0 2px 40px ${({ theme }) => theme.backgroundDark};
  padding: 1em 2em 0 2em;
  font-size: 1em;
  overflow: hidden;
  height: auto;
  border-radius: 3px;
`;

const Button = styled.button`
  cursor: pointer;
  outline: 0;
  border: none;
  background: transparent;
  display: flex;
  align-self: flex-end;
  position: abo
  overflow: hidden;
  margin: 0;
  padding: 0;
  padding-bottom: 2em;
  color: ${({ theme }) => theme.fontDark};
  :hover {
    color: ${({ theme }) => theme.font};
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`;

const Life = animated(styled.div`
  position: absolute;
  bottom: ${(props) => (props.top ? "0.5em" : "0")};
  left: 0px;
  width: auto;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  background-image: linear-gradient(
    130deg,
    ${({ theme }) => theme.brand},
    ${({ theme }) => theme.brandFullyTransparent}
  );
  height: 0.5em;
`);

let id = 0;

const DIE = {
  "Server Error": false,
};

const COLOR = {
  "Server Error": "error",
};

type Notification = {
  id?: number;
  kind: string;
  message: string;
  items: string[];
};

const NotificationHub = ({
  config = { tension: 125, friction: 20, precision: 0.1 },
  children,
}) => {
  const theme = useContext(ThemeContext);
  const [refMap] = useState(() => new WeakMap());
  const [cancelMap] = useState(() => new WeakMap());
  const [items, setItems] = useState([]);
  const transitions = useTransition(items, (item) => item.key, {
    from: { opacity: 0, height: 0, life: "100%" },
    enter: (item) => async (next) => {
      await next({ opacity: 1, height: refMap.get(item).offsetHeight });
    },
    leave: (item) => async (next, cancel) => {
      cancelMap.set(item, cancel);
      await next({ life: "0%" });
      await next({ opacity: 0 });
      await next({ height: 0 });
    },
    onRest: (item) =>
      setItems((state) => state.filter((i) => i.key !== item.key)),
    config: (item, state) => {
      return state === "leave"
        ? [
            { duration: item.die ? 3000 : Number.POSITIVE_INFINITY },
            config,
            config,
          ]
        : config;
    },
  });

  useEffect(
    () =>
      void children((msg) =>
        setItems((state) => [...state, { key: id++, ...msg }])
      ),
    []
  );

  return (
    <Container>
      {transitions.map(({ key, item, props: { life, ...style } }) => (
        <Message key={key} style={style}>
          <Content ref={(ref) => ref && refMap.set(item, ref)}>
            {true ? <Life style={{ right: life }} /> : null}
            <Header>
              <MessageTitle style={{ color: theme[COLOR[item.kind]] }}>
                {item.kind}
              </MessageTitle>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  cancelMap.has(item) && cancelMap.get(item)();
                }}
              >
                <Close />
              </Button>
            </Header>
            <MessageText>{item.message}</MessageText>
          </Content>
        </Message>
      ))}
    </Container>
  );
};

export default NotificationHub;
