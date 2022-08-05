import { RouterContext } from "@fiftyone/state";
import React, {
  MouseEventHandler,
  useCallback,
  useContext,
  useTransition,
} from "react";

const Link: React.FC<
  React.PropsWithChildren<{
    to?: string | MouseEventHandler;
    title: string;
    className?: string;
    style?: React.CSSProperties;
  }>
> = ({ children, className, style, title, to }) => {
  const router = useContext(RouterContext);
  const [pending, startTransition] = useTransition();

  return (
    <a
      href={typeof to === "string" ? to : undefined}
      onClick={
        typeof to === "string"
          ? useCallback<React.MouseEventHandler<HTMLAnchorElement>>(
              (event) => {
                event.preventDefault();
                startTransition(() => {
                  router.history.push(to);
                });
              },
              [to, router]
            )
          : to instanceof Function
          ? to
          : undefined
      }
      style={style}
      className={className}
      title={title}
    >
      {children}
    </a>
  );
};

export default Link;
