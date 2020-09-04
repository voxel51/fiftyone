import React from "react";
import styled from "styled-components";
import copy from "copy-to-clipboard";
import { Checkbox, FormControlLabel } from "@material-ui/core";

import { RESERVED_FIELDS } from "../utils/labels";
import { Button, ModalFooter } from "./utils";

type Props = {
  object: object;
  filter: { [key: string]: boolean };
  enableFilter: (enabled: boolean) => void;
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
  }
  pre::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  pre::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
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

const JSONView = ({ object, filter, enableFilter }: Props) => {
  if (filter) {
    object = Object.fromEntries(
      Object.entries(object).filter(
        ([key]) => filter[key] || RESERVED_FIELDS.includes(key)
      )
    );
  }
  const str = JSON.stringify(object, null, 4);
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
                  checked={Boolean(filter)}
                  onChange={() => enableFilter(!filter)}
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
