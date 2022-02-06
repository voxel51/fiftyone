import RoutingContext from "./RoutingContext";
import React from "react";

const { useCallback, useContext } = React;

const Link: React.FC<{
  to: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
}> = (props) => {
  const router = useContext(RoutingContext);

  const changeRoute = useCallback(
    (event) => {
      event.preventDefault();
      router.history.push(props.to);
    },
    [props.to, router]
  );

  const preloadRouteCode = useCallback(() => {
    router.preloadCode(props.to);
  }, [props.to, router]);

  const preloadRoute = useCallback(() => {
    router.preload(props.to);
  }, [props.to, router]);

  return (
    <a
      href={props.to}
      onClick={changeRoute}
      onMouseEnter={preloadRouteCode}
      onMouseDown={preloadRoute}
      style={props.style}
      className={props.className}
      title={props.title}
    >
      {props.children}
    </a>
  );
};

export default Link;
