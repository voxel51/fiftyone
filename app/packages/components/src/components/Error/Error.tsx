import { Clear, FileCopy } from "@material-ui/icons";
import React from "react";
import { useCopyToClipboard } from "react-use";

import style from "./Error.module.css";

interface Props {
  reset: () => void;
  error: {
    kind?: string;
    stack?: string;
  };
}

const Error: React.FC<Props> = ({ error, reset }) => {
  const [_, copy] = useCopyToClipboard();

  return (
    <div className={style.wrapper}>
      <div className={style.container}>
        <div className={style.heading}>
          <div>{error.kind ? error.kind : "App Error"}</div>
          <div>
            <div>
              <span title={"Reset"} onClick={reset}>
                <Clear />
              </span>
            </div>
            {error.stack && (
              <div>
                <span
                  title={"Copy stack"}
                  onClick={() => copy(error.stack || "")}
                >
                  <FileCopy />
                </span>
              </div>
            )}
          </div>
        </div>
        {error.stack && (
          <div className={style.message}>
            {error.stack && (
              <div className={style.stack}>
                {error.stack.split("\n").map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Error;
