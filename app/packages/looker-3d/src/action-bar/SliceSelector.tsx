import { PopoutSectionTitle } from "@fiftyone/components";
import { Checkbox } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { ACTION_SET_PCDS } from "../constants";
import {
  ActionItem,
  ActionPopOverDiv,
  ActionPopOverInner,
} from "../containers";
import { currentActionAtom } from "../state";

const SliceSelectorLabel = styled.div`
  margin-right: 1rem;
  max-width: 8.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.2em;
  text-decoration-thickness: from-font;
  text-decoration-color: var(--fo-palette-text-tertiary);

  &:hover {
    text-decoration-color: var(--fo-palette-primary-main);
  }
`;

export const SliceSelector = () => {
  const active3dSlices = useRecoilValue(fos.active3dSlices);
  const all3dSlices = useRecoilValue(fos.all3dSlices);
  const [currentAction, setAction] = useRecoilState(currentActionAtom);

  const activeSlicesLabel = useMemo(() => {
    if (!active3dSlices || active3dSlices.length === 0) {
      return "";
    }

    if (active3dSlices.length === 1) {
      return active3dSlices[0];
    }

    if (active3dSlices.length === all3dSlices.length) {
      return "all 3D slices";
    }

    return `${active3dSlices.length} slices`;
  }, [active3dSlices, all3dSlices]);

  const handleActionClick = useCallback(() => {
    if (currentAction === ACTION_SET_PCDS) {
      setAction(null);
    } else {
      setAction(ACTION_SET_PCDS);
    }
  }, [setAction, currentAction]);

  if (!active3dSlices || active3dSlices.length === 0) {
    return null;
  }

  return (
    <>
      <ActionItem data-cy={"looker3d-select-slices"} title="Select 3D slices">
        <SliceSelectorLabel onClick={handleActionClick}>
          {activeSlicesLabel}
        </SliceSelectorLabel>
      </ActionItem>

      {currentAction === ACTION_SET_PCDS && <PcdsSelector />}
    </>
  );
};

const PcdsSelector = () => {
  const [active3dSlices, setActive3dSlices] = useRecoilState(
    fos.active3dSlices
  );
  const all3dSlices = Object.keys(useRecoilValue(fos.all3dSlicesToSampleMap));

  const containerRef = useRef<HTMLDivElement>(null);

  const ref = useRef<HTMLDivElement>(null);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  fos.useOutsideClick(ref, () => isSelectorOpen && setIsSelectorOpen(false));

  if (all3dSlices.length === 0) {
    return null;
  }

  return (
    <ActionPopOverDiv ref={containerRef}>
      <ActionPopOverInner>
        <PopoutSectionTitle>Select 3D slices</PopoutSectionTitle>
        <div data-cy={"looker3d-slice-checkboxes"}>
          {all3dSlices.map((slice) => {
            return (
              <Checkbox
                name={slice}
                key={slice}
                value={active3dSlices.includes(slice)}
                muted={
                  active3dSlices.includes(slice) && active3dSlices.length === 1
                }
                setValue={(value) => {
                  setActive3dSlices(
                    value
                      ? [...active3dSlices, slice]
                      : active3dSlices.filter((s) => s !== slice)
                  );
                }}
              />
            );
          })}
        </div>
      </ActionPopOverInner>
    </ActionPopOverDiv>
  );
};
