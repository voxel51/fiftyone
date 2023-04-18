import { PopoutSectionTitle } from "@fiftyone/components";
import { Checkbox } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { ActionItem } from "../containers";
import { ACTION_SET_PCDS, currentActionAtom } from "../state";
import { ActionPopOver } from "./shared";

export const SliceSelector = () => {
  const activePcdSlices = useRecoilValue(fos.activePcdSlices);
  const allPcdSlices = useRecoilValue(fos.allPcdSlices);
  const [currentAction, setAction] = useRecoilState(currentActionAtom);

  const activeSlicesLabel = useMemo(() => {
    if (activePcdSlices.length === 0) {
      return "Select pcds";
    }
    if (activePcdSlices.length === 2) {
      return activePcdSlices.join(" and ");
    }
    if (activePcdSlices.length === allPcdSlices.length) {
      return "All pcds selected";
    }
    return `${activePcdSlices.length} selected`;
  }, [activePcdSlices, allPcdSlices]);

  const handleActionClick = useCallback(() => {
    setAction(ACTION_SET_PCDS);
  }, [setAction]);

  const [mRef] = useMeasure();

  return (
    <>
      <ActionItem title="Select pcds">
        <div ref={mRef} onClick={handleActionClick}>
          {activeSlicesLabel}
        </div>
      </ActionItem>
      {currentAction === ACTION_SET_PCDS && <PcdsSelector />}
    </>
  );
};

const Container = styled.div`
  position: relative;
`;

const PcdsSelector = () => {
  const [activePcdSlices, setActivePcdSlices] = useRecoilState(
    fos.activePcdSlices
  );
  const allPcdSlices = useRecoilValue(fos.allPcdSlices);

  const ref = useRef<HTMLDivElement>(null);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  fos.useOutsideClick(ref, () => isSelectorOpen && setIsSelectorOpen(false));

  if (allPcdSlices.length === 0) {
    return null;
  }

  return (
    <Container>
      <ActionPopOver>
        <PopoutSectionTitle>Select pcds</PopoutSectionTitle>
        <div>
          {allPcdSlices.map((slice) => {
            return (
              <Checkbox
                name={slice}
                key={slice}
                value={activePcdSlices.includes(slice)}
                muted={
                  activePcdSlices.includes(slice) &&
                  activePcdSlices.length === 1
                }
                setValue={(value) => {
                  setActivePcdSlices(
                    value
                      ? [...activePcdSlices, slice]
                      : activePcdSlices.filter((s) => s !== slice)
                  );
                }}
              />
            );
          })}
        </div>
      </ActionPopOver>
    </Container>
  );
};
