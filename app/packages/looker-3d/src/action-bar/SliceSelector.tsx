import { PopoutSectionTitle } from "@fiftyone/components";
import { Checkbox } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
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
  const {
    state: { activeSlices, allSlices },
  } = fos.useRenderConfig3d();
  const [currentAction, setAction] = useRecoilState(currentActionAtom);

  const activeSlicesLabel = useMemo(() => {
    if (!activeSlices || activeSlices.length === 0) {
      return "";
    }

    if (activeSlices.length === 1) {
      return activeSlices[0];
    }

    if (activeSlices.length === allSlices.length) {
      return "all 3D slices";
    }

    return `${activeSlices.length} slices`;
  }, [activeSlices, allSlices]);

  const handleActionClick = useCallback(() => {
    if (currentAction === ACTION_SET_PCDS) {
      setAction(null);
    } else {
      setAction(ACTION_SET_PCDS);
    }
  }, [setAction, currentAction]);

  if (!activeSlices || activeSlices.length === 0) {
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
  const {
    state: { activeSlices, allSampleMap, allSlices },
    actions,
  } = fos.useRenderConfig3d();
  const setCurrentAction = useSetRecoilState(currentActionAtom);
  const availableSlices = allSlices.filter((slice) =>
    Boolean(allSampleMap[slice])
  );

  const containerRef = useRef<HTMLDivElement>(null);

  fos.useOutsideClick(containerRef, () => {
    setCurrentAction(null);
  });

  if (availableSlices.length === 0) {
    return null;
  }

  return (
    <ActionPopOverDiv ref={containerRef}>
      <ActionPopOverInner>
        <PopoutSectionTitle>Select 3D slices</PopoutSectionTitle>
        <div data-cy={"looker3d-slice-checkboxes"}>
          {availableSlices.map((slice) => {
            return (
              <Checkbox
                name={slice}
                key={slice}
                value={activeSlices.includes(slice)}
                muted={
                  activeSlices.includes(slice) && activeSlices.length === 1
                }
                setValue={(value) => {
                  actions.toggleSlice(slice, value);
                }}
              />
            );
          })}
        </div>
      </ActionPopOverInner>
    </ActionPopOverDiv>
  );
};
