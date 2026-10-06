import { useTrackEvent } from "@fiftyone/analytics";
import { useClearModal } from "@fiftyone/state";
import {
  GraphQLError,
  NetworkError,
  NotFoundError,
  OperatorError,
  PanelEventError,
} from "@fiftyone/utilities";
import { Clear } from "@mui/icons-material";
import classnames from "classnames";
import React, {
  ComponentType,
  PropsWithChildren,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import { ErrorBoundary as Boundary, FallbackProps } from "react-error-boundary";
import scrollableStyles from "../../scrollable.module.css";
import CodeBlock from "../CodeBlock";
import Loading from "../Loading";
import style from "./ErrorBoundary.module.css";

// any Error renders; the app error classes add details via instanceof
interface ErrorDisplayProps<T extends Error> {
  error: T;
  onReset?: () => void;
  disableReset?: boolean;
  resetErrorBoundary: () => void;
}

/**
 * Note: we shouldn't add any side effects to this component.
 * For that, use `ErrorsDisplayWithSideEffects`.
 */
export const ErrorDisplayMarkup = <T extends Error>({
  error,
  onReset,
  disableReset,
  resetErrorBoundary,
}: ErrorDisplayProps<T>) => {
  if (error instanceof NotFoundError) {
    return <Loading>{error.message}</Loading>;
  }

  let messages: { message: string; content: string }[] = [];

  if (error instanceof GraphQLError) {
    messages = error.errors.map((e) => {
      const stack = e?.extensions?.stack;
      const trace = Array.isArray(stack) ? stack.join("\n") : stack;
      return {
        message: e?.message,
        content: typeof trace === "string" && trace ? "\n\n" + trace : "",
      };
    });
  } else if (error instanceof NetworkError) {
    messages = [];
    if (error.code)
      messages.push({ message: "Code", content: String(error.code) });
    if (error.route) messages.push({ message: "Route", content: error.route });
    if (error.payload)
      messages.push({
        message: "Payload",
        content: JSON.stringify(error.payload, null, 2),
      });
  } else if (error instanceof OperatorError) {
    if (error.message) {
      messages.push({ message: "Message", content: error.message });
    }
    if (error.operator) {
      messages.push({ message: "Operator", content: error.operator });
    }
    if (error instanceof PanelEventError) {
      messages.push({ message: "Event", content: error.event });
    }
    messages.push({ message: "Trace", content: error.stack });
  }
  if (error.stack && !(error instanceof OperatorError)) {
    messages = [...messages, { message: "Trace", content: error.stack }];
  }

  function handleReset() {
    if (onReset) {
      onReset();
    }
    resetErrorBoundary();
  }

  return (
    <div
      className={classnames(style.wrapper, scrollableStyles.scrollable)}
      data-cy={"error-boundary"}
    >
      <div className={classnames(style.container, scrollableStyles.scrollable)}>
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

const ErrorsDisplayWithSideEffects = (
  onReset?: () => void,
  disableReset?: boolean,
) => {
  const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
    const clearModal = useClearModal();
    useLayoutEffect(() => {
      clearModal();
      // once, when the fallback mounts
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, []);

    return (
      <ErrorDisplayMarkup
        error={error}
        onReset={onReset}
        disableReset={disableReset}
        resetErrorBoundary={resetErrorBoundary}
      />
    );
  };
  return FallbackComponent;
};

const TrackFallback = (
  Fallback: ComponentType<FallbackProps> | undefined,
  onReset?: () => void,
  disableReset?: boolean,
) => {
  // built once per fallback, not per render, so the error display keeps its
  // identity (and its state) across re-renders
  const ActualFallback =
    Fallback || ErrorsDisplayWithSideEffects(onReset, disableReset);

  const TrackedFallback = (props: FallbackProps) => {
    const trackEvent = useTrackEvent();

    useEffect(() => {
      // GraphQLError carries per-error messages
      const error = props?.error as Error & { errors?: { message?: string }[] };
      trackEvent("uncaught_app_error", {
        error: error?.message || error?.name || error,
        stack: error?.stack,
        messages: error?.errors?.map((e) => e.message),
      });
      // report each error once, when its fallback mounts
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, []);

    return <ActualFallback {...props} />;
  };
  return TrackedFallback;
};

const ErrorBoundary: React.FC<
  PropsWithChildren<{
    onReset?: () => void;
    disableReset?: boolean;
    Fallback?: ComponentType<FallbackProps>;
  }>
> = ({ children, onReset, disableReset, Fallback }) => {
  // A new component type each render would remount the fallback (re-firing
  // the uncaught_app_error event) whenever the parent re-renders.
  const FallbackComponent = useMemo(
    () => TrackFallback(Fallback, onReset, disableReset),
    [Fallback, onReset, disableReset],
  );

  return <Boundary FallbackComponent={FallbackComponent}>{children}</Boundary>;
};

export default ErrorBoundary;
