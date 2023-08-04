import { PopoutSectionTitle } from "@fiftyone/components";
import { Checkbox } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { ActionItem } from "../containers";
import { ACTION_SET_PCDS, currentActionAtom } from "../state";
import { ActionPopOver } from "./shared";

export const SliceSelector = () => {
  const activePcdSlices = useRecoilValue(fos.activePcdSlices);
  const allPcdSlices = useRecoilValue(fos.allPcdSlices);
  const [currentAction, setAction] = useRecoilState(currentActionAtom);

  const activeSlicesLabel = useMemo(() => {
    if (!activePcdSlices || activePcdSlices.length === 0) {
      return "";
    }

    if (activePcdSlices.length === 1) {
      return `Showing ${activePcdSlices[0]}`;
    }
    if (activePcdSlices.length === 2) {
      return `Showing ${activePcdSlices.join(" and ")}`;
    }
    if (activePcdSlices.length === allPcdSlices.length) {
      return "Showing all point clouds";
    }
    return `Showing ${activePcdSlices.length} point clouds`;
  }, [activePcdSlices, allPcdSlices]);

  const handleActionClick = useCallback(() => {
    if (currentAction === ACTION_SET_PCDS) {
      setAction(null);
    } else {
      setAction(ACTION_SET_PCDS);
    }
  }, [setAction, currentAction]);

  if (!activePcdSlices || activePcdSlices.length === 0) {
    return null;
  }

  return (
    <>
      <ActionItem title="Select point clouds">
        <div onClick={handleActionClick}>{activeSlicesLabel}</div>
      </ActionItem>

      {currentAction === ACTION_SET_PCDS && <PcdsSelector />}
    </>
  );
};

const PcdsSelector = () => {
  const [activePcdSlices, setActivePcdSlices] = useRecoilState(
    fos.activePcdSlices
  );
  const allPcdSlices = Object.keys(useRecoilValue(fos.allPcdSlicesToSampleMap));

  const ref = useRef<HTMLDivElement>(null);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  fos.useOutsideClick(ref, () => isSelectorOpen && setIsSelectorOpen(false));

  if (allPcdSlices.length === 0) {
    return null;
  }

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Select point clouds</PopoutSectionTitle>
      <div>
        {allPcdSlices.map((slice) => {
          return (
            <Checkbox
              name={slice}
              key={slice}
              value={activePcdSlices.includes(slice)}
              muted={
                activePcdSlices.includes(slice) && activePcdSlices.length === 1
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
  );
};
