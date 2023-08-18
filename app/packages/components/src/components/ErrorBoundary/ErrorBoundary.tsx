import { useClearModal, useTo } from "@fiftyone/state";
import {
  GraphQLError,
  NetworkError,
  NotFoundError,
  ServerError,
} from "@fiftyone/utilities";
import { Clear } from "@mui/icons-material";
import classnames from "classnames";
import React, {
  ComponentType,
  PropsWithChildren,
  useLayoutEffect,
} from "react";
import { ErrorBoundary as Boundary, FallbackProps } from "react-error-boundary";

import { scrollable } from "../../scrollable.module.css";
import CodeBlock from "../CodeBlock";

import Loading from "../Loading";

import style from "./ErrorBoundary.module.css";

type AppError = GraphQLError | NetworkError | NotFoundError | ServerError;

interface Props<T extends AppError> extends FallbackProps {
  error: T;
}

const Errors = (onReset?: () => void, disableReset?: boolean) => {
  const FallbackComponent = <T extends AppError>({
    error,
    resetErrorBoundary,
  }: Props<T>) => {
    const { to } = useTo({ state: {} });
    const clearModal = useClearModal();
    useLayoutEffect(() => {
      clearModal();
    }, []);

    if (error instanceof NotFoundError) {
      return <Loading>{error.message}</Loading>;
    }

    let messages: { message: string; content: string }[] = [];

    if (error instanceof GraphQLError) {
      messages = error.errors.map((e) => ({
        message: e.message,
        content: "\n\n" + e.extensions.stack.join("\n"),
      }));
    } else if (error instanceof NetworkError) {
      messages = [];
      if (error.code)
        messages.push({ message: "Code", content: String(error.code) });
      if (error.route)
        messages.push({ message: "Route", content: error.route });
      if (error.payload)
        messages.push({
          message: "Payload",
          content: JSON.stringify(error.payload, null, 2),
        });
    }

    if (error.stack) {
      messages = [...messages, { message: "Trace", content: error.stack }];
    }

    function handleReset() {
      if (onReset) {
        onReset();
      } else {
        to("/");
      }
      resetErrorBoundary();
    }

    return (
      <div
        className={classnames(style.wrapper, scrollable)}
        data-cy={"error-boundary"}
      >
        <div className={classnames(style.container, scrollable)}>
          <div className={style.heading}>
            <div>
              {error.name}
              {error.message ? ": " + error.message : null}
            </div>
            {!disableReset && (
              <div>
                <span title={"Reset"} onClick={handleReset}>
                  <Clear />
                </span>
              </div>
            )}
          </div>
          {messages.map(({ message, content }, i) => (
            <div key={i} className={style.content}>
              <div className={style.contentHeading}>
                {message ? message : null}
              </div>
              {content && (
                <CodeBlock
                  text={content.trim().replace(/\n+/g, "\n")}
                  language="javascript"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };
  return FallbackComponent;
};

const ErrorBoundary: React.FC<
  PropsWithChildren<{
    onReset?: () => void;
    disableReset?: boolean;
    Fallback?: ComponentType;
  }>
> = ({ children, onReset, disableReset, Fallback }) => {
  // @ts-ignore
  return (
    <Boundary FallbackComponent={Fallback || Errors(onReset, disableReset)}>
      {children}
    </Boundary>
  );
};

export default ErrorBoundary;
