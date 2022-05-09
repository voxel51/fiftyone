import React, { useCallback, useContext, useTransition } from "react";
import { RouterContext } from "../../routing";

const Link: React.FC<{
  to: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
}> = (props) => {
  const router = useContext(RouterContext);
  const [pending, startTransition] = useTransition();

  const changeRoute = useCallback(
    (event) => {
      event.preventDefault();
      startTransition(() => {
        router.history.push(props.to);
      });
    },
    [props.to, router]
  );

  const preloadRoute = useCallback(() => {
    router.preload(props.to);
  }, [props.to, router]);

  return (
    <a
      href={props.to}
      onClick={changeRoute}
      onMouseEnter={preloadRoute}
      style={props.style}
      className={props.className}
      title={props.title}
    >
      {props.children}
    </a>
  );
};

export default Link;
