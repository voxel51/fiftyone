import React, { MutableRefObject, useEffect, useState } from "react";
import styled from "styled-components";
import copy from "copy-to-clipboard";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { useRecoilValue } from "recoil";

import { Button, ModalFooter, scrollbarStyles } from "./utils";
import { sampleModalFilter } from "./Filters/LabelFieldFilters.state";
import { FrameLooker, ImageLooker, VideoLooker } from "../../../looker";
import Loading from "./Common/Loading";
import * as selectors from "../recoil/selectors";

type Props = {
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>;
  enableFilter: (enabled: boolean) => void;
  filterJSON: boolean;
};

const Body = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  position: absolute;
  top: 0;
  left: 0;
  background: ${({ theme }) => theme.backgroundDark};

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

const JSONView = ({ lookerRef, enableFilter, filterJSON }: Props) => {
  const filter = useRecoilValue(sampleModalFilter);
  const [copying, setCopying] = useState(false);
  const isVideo =
    useRecoilValue(selectors.isRootView) &&
    useRecoilValue(selectors.isVideoDataset);

  let [sample, setSample] = useState(null);

  useEffect(() => {
    lookerRef.current.getSample().then(setSample);
  }, []);

  if (!sample) {
    return null;
  }

  if (filterJSON && sample) {
    sample = filter(sample);
    if (isVideo) {
      sample.frames[0] = filter(sample.frames[0], "frames.", false, false);
    }
  }
  const str = JSON.stringify(sample, null, 4);

  return (
    <Body>
      {sample ? (
        <>
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
              <Button
                onClick={() => {
                  setCopying(true);
                  setTimeout(() => setCopying(false), 1000);
                  copy(str);
                }}
              >
                {copying ? "Copied!" : "Copy JSON"}
              </Button>
            </div>
          </ModalFooter>
        </>
      ) : (
        <Loading />
      )}
    </Body>
  );
};

export default JSONView;
