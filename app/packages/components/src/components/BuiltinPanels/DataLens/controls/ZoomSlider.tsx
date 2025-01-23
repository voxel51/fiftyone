import { Slider } from "@mui/material";
import { useAtom } from "jotai";
import React from "react";
import { zoomLevelAtom } from "../state";
import styles from "./styles.module.css";

const MIN_ZOOM = 1;
const MAX_ZOOM = 11;

export const ZoomSlider = () => {
  const [zoom, setZoom] = useAtom(zoomLevelAtom);

  return (
    <Slider
      value={zoom}
      onChange={(_, val) => setZoom(val instanceof Array ? val[0] : val)}
      min={MIN_ZOOM}
      max={MAX_ZOOM}
      step={1}
      color="primary"
      sx={{
        width: 50,
        boxShadow: "none",
      }}
      classes={{
        root: styles.root,
        thumb: styles.thumb,
      }}
    />
  );
};
