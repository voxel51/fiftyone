import React from "react";
import styled from "styled-components";
import copy from "copy-to-clipboard";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { useRecoilValue } from "recoil";

import { Button, ModalFooter, scrollbarStyles } from "./utils";
import * as selectors from "../recoil/selectors";

type Props = {
  object: object;
  enableFilter: (enabled: boolean) => void;
  filterJSON: boolean;
};

const Body = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  pre {
    margin: 0;
    padding: 2em;
    flex-grow: 1;
    overflow-y: auto;
    ${scrollbarStyles};
  }

  ${ModalFooter} {
    flex-direction: column;
    align-items: flex-end;

    > div.controls {
      display: flex;

      .label {
        font-weight: bold;
        font-family: unset;
      }

      .checkbox {
        padding: 0 5px;
        color: ${({ theme }) => theme.fontDark};

        &.checked {
          color: ${({ theme }) => theme.brand};
        }
      }
    }
  }
`;

const JSONView = ({ object, enableFilter, filterJSON }: Props) => {
  const filter = useRecoilValue(selectors.sampleModalFilter);
  const str = JSON.stringify(filterJSON ? filter(object) : object, null, 4);

  return (
    <Body>
      <pre>{str}</pre>
      <ModalFooter>
        <div className="controls">
          {enableFilter ? (
            <FormControlLabel
              label="Filter"
              classes={{ label: "label" }}
              control={
                <Checkbox
                  checked={Boolean(filterJSON)}
                  onChange={() => enableFilter(!filterJSON)}
                  classes={{ root: "checkbox", checked: "checked" }}
                />
              }
            />
          ) : null}
          <Button onClick={() => copy(str)}>Copy JSON</Button>
        </div>
      </ModalFooter>
    </Body>
  );
};

export default JSONView;
