import { IconButton, PopoutSectionTitle, useTheme } from "@fiftyone/components";
import { NumberInput } from "@fiftyone/core/src/components/Common/Input";
import { CloseTwoTone } from "@mui/icons-material";
import GridOnIcon from "@mui/icons-material/GridOn";
import { Checkbox, Typography } from "@mui/material";
import React, { useCallback, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { ActionItem } from "../containers";
import {
  gridCellSizeAtom,
  gridSectionSizeAtom,
  gridSizeAtom,
  isGridInfinitelyLargeAtom,
  isGridOnAtom,
  shouldGridFadeAtom,
} from "../state";
import { ActionPopOver } from "./shared";
import style from "./style.module.css";

const GridConfigurator = () => {
  const [isOn, setIsOn] = useState(true);

  const containerRef = useRef(null);

  const theme = useTheme();

  const [gridCellSize, setGridCellSize] = useRecoilState(gridCellSizeAtom);
  const [gridSectionSize, setGridSectionSize] =
    useRecoilState(gridSectionSizeAtom);
  const [gridSize, setGridSize] = useRecoilState(gridSizeAtom);
  const [isGridInfinitelyLarge, setIsGridInfinitelyLarge] = useRecoilState(
    isGridInfinitelyLargeAtom
  );
  const [shouldGridFade, setShouldGridFade] =
    useRecoilState(shouldGridFadeAtom);

  if (!isOn) {
    return null;
  }

  return (
    <ActionPopOver ref={containerRef}>
      <PopoutSectionTitle>
        <Typography>Configure Grid</Typography>
        <IconButton onClick={() => setIsOn(false)}>
          <CloseTwoTone fontSize="small" />
        </IconButton>
      </PopoutSectionTitle>

      <div
        data-cy={"looker3d-grid-configurator"}
        className={style.gridConfigContainer}
      >
        <div className={style.gridLabel}>
          <Typography variant="body2">Cell Size</Typography>
          <NumberInput
            value={gridCellSize}
            setter={setGridCellSize}
            min={1}
            max={100}
            step={1}
          />
        </div>

        <div className={style.gridLabel}>
          <Typography variant="body2">Section Size</Typography>
          <NumberInput
            value={gridSectionSize}
            setter={setGridSectionSize}
            min={1}
            max={100}
            step={1}
          />
        </div>

        {!isGridInfinitelyLarge && (
          <div className={style.gridLabel}>
            <Typography variant="body2">Grid Size</Typography>
            <NumberInput
              value={gridSize}
              setter={setGridSize}
              min={1}
              max={10000}
              step={1}
            />
          </div>
        )}

        <div className={style.gridLabel}>
          <Typography variant="body2">Infinite Grid</Typography>
          <Checkbox
            checked={isGridInfinitelyLarge}
            size="small"
            disableFocusRipple
            onChange={(e) => setIsGridInfinitelyLarge(e.target.checked)}
          />
        </div>
        <div className={style.gridLabel}>
          <Typography variant="body2">Fade</Typography>
          <Checkbox
            checked={shouldGridFade}
            size="small"
            disableFocusRipple
            onChange={(e) => setShouldGridFade(e.target.checked)}
          />
        </div>
      </div>
    </ActionPopOver>
  );
};

export const ToggleGridHelper = () => {
  const [isGridOn, setIsGridOn] = useRecoilState(isGridOnAtom);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const { primary } = useTheme();

  const handleClick = useCallback((e: React.MouseEvent) => {
    setIsGridOn((prev) => {
      if (isFirstLoad) {
        setIsFirstLoad(false);
      }

      return !prev;
    });
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return (
    <>
      <ActionItem title="Toggle Grid (G)">
        <GridOnIcon
          sx={{ fontSize: 24 }}
          style={{
            color: isGridOn ? primary.main : "inherit",
          }}
          onClick={handleClick}
        />
      </ActionItem>
      {isGridOn && !isFirstLoad && <GridConfigurator />}
    </>
  );
};
