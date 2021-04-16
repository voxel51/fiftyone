import React from "react";
import styled from "styled-components";
import copy from "copy-to-clipboard";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { selectorFamily, SerializableParam, useRecoilValue } from "recoil";

import { Button, ModalFooter, scrollbarStyles } from "./utils";
import { sampleModalFilter } from "./Filters/LabelFieldFilters.state";
import * as selectors from "../recoil/selectors";

const modalSampleOrCurrentFrame = selectorFamily<
  SerializableParam,
  { frameNumber?: number; filterJSON: boolean }
>({
  key: "modalSampleOrCurrentFrame",
  get: ({ frameNumber, filterJSON }) => ({ get }) => {
    const sample = get(selectors.modalSample);
    const filter = get(sampleModalFilter);
    const op = (obj, prefix = null) => (filterJSON ? filter(obj, prefix) : obj);
    let object = { ...op(sample) };
    if (get(selectors.isVideoDataset)) {
      let frame = get(selectors.sampleFramesMap(sample._id))[frameNumber];
      if (!frame && frameNumber === 1) {
        frame = sample.frames;
      }
      object = {
        ...object,
        frames: {
          frameNumber: Object.fromEntries(
            Object.entries(op(frame, "frames.")).map(([k, v]) => [k, v])
          ),
        },
      };
    }
    return Object.fromEntries(
      Object.entries(object).filter(([k]) => !k.startsWith("_"))
    );
  },
});

type Props = {
  currentFrame?: number;
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
    overflow-y: auto;
    height: calc(100% - 64px);
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

const JSONView = ({ currentFrame, enableFilter, filterJSON }: Props) => {
  const object = useRecoilValue(
    modalSampleOrCurrentFrame({ frameNumber: currentFrame, filterJSON })
  );
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
