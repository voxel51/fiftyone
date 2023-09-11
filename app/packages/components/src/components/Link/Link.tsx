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
    href?: string;
    target?: React.HTMLAttributeAnchorTarget;
    cy?: string;
  }>
> = ({ children, className, cy, href, style, target, title, to }) => {
  const router = useContext(RouterContext);
  const [pending, startTransition] = useTransition();

  return (
    <a
      data-cy={cy}
      href={typeof to === "string" ? to : href}
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
      target={target}
      title={title}
    >
      {children}
    </a>
  );
};

export default Link;
