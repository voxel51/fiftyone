import classnames from "classnames";
import { Clear, FileCopy } from "@material-ui/icons";
import React from "react";
import { useCopyToClipboard } from "react-use";

import { GraphQLError, NotFoundError, ServerError } from "@fiftyone/utilities";

import { scrollable } from "../../scrollable.module.css";

import Loading from "../Loading";

import style from "./Error.module.css";

interface Props {
  reset: () => void;
  error: GraphQLError | Error | ServerError;
}

const ErrorPage: React.FC<Props> = ({ error, reset }) => {
  const [_, copy] = useCopyToClipboard();

  if (error instanceof NotFoundError) {
    return <Loading>{error.message}</Loading>;
  }
  let stacks = [""];

  if ("errors" in error) {
    console.log(error.errors);
    stacks = error.errors.map((e) => e.extensions.stack.join("\n"));
  } else if (error.stack) {
    stacks = [error.stack];
  }

  return (
    <div className={style.wrapper}>
      {stacks.map((stack) => (
        <div className={classnames(style.container, scrollable)}>
          <div className={style.heading}>
            <div>{error.name}</div>
            <div>
              <div>
                <span title={"Reset"} onClick={reset}>
                  <Clear />
                </span>
              </div>
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

export default ErrorPage;
