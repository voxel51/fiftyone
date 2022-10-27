import { useTo } from "@fiftyone/state";
import { GraphQLError, NotFoundError, ServerError } from "@fiftyone/utilities";
import { Clear, FileCopy } from "@mui/icons-material";
import classnames from "classnames";
import React, { PropsWithChildren, useLayoutEffect } from "react";
import { ErrorBoundary as Boundary, FallbackProps } from "react-error-boundary";
import { useCopyToClipboard } from "react-use";

import { scrollable } from "../../scrollable.module.css";

import Loading from "../Loading";

import style from "./ErrorBoundary.module.css";

interface Props extends FallbackProps {
  error: GraphQLError | Error | ServerError;
}

const Errors: React.FC<Props> = ({ error, resetErrorBoundary }) => {
  const { to } = useTo({ state: {} });
  useLayoutEffect(() => {
    document.getElementById("modal")?.classList.remove("modalon");
  }, []);

  const [_, copy] = useCopyToClipboard();
  if (error instanceof NotFoundError) {
    return <Loading>{error.message}</Loading>;
  }

  let stacks = [""];

  if ("errors" in error) {
    stacks = error.errors.map(
      (e) => e.message + "\n\n" + e.extensions.stack.join("\n")
    );
  } else if (error.stack) {
    stacks = [error.stack];
  }

  return (
    <div className={style.wrapper}>
      {stacks.map((stack, i) => (
        <div key={i} className={classnames(style.container, scrollable)}>
          <div className={style.heading}>
            <div>{error.name}</div>
            <div>
              {i === 0 && (
                <div>
                  <span
                    title={"Reset"}
                    onClick={() => {
                      to("/");
                      resetErrorBoundary();
                    }}
                  >
                    <Clear />
                  </span>
                </div>
              )}
              {stack && (
                <div>
                  <span title={"Copy stack"} onClick={() => copy(stack)}>
                    <FileCopy />
                  </span>
                </div>
              )}
            </div>
          </div>
          {stack && (
            <div className={style.message}>
              {stack && (
                <div className={style.stack}>
                  {stack.split("\n").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const ErrorBoundary: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  return <Boundary FallbackComponent={Errors}>{children}</Boundary>;
};

export default ErrorBoundary;
