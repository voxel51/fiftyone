import { Button, Dialog } from "@fiftyone/components";
import { getRGBColorFromPool } from "@fiftyone/core/src/components/ColorModal/utils";
import Input from "@fiftyone/core/src/components/Common/Input";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import IconButton from "@mui/material/IconButton";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import tunnel from "tunnel-rat";
import { getGradientFromSchemeName } from "../renderables/pcd/shaders/gradientMap";

interface PcdColormapModalProps {
  isOpen: boolean;
  onClose: () => void;
  attribute: string;
  onSave: (colorscaleList: ColorscaleInput["list"]) => void;
  initialColorscale?: ColorscaleInput;
}

export const PcdColorMapTunnel = tunnel();

/**
 * Convert RGB string to hex
 *
 * @param rgb - RGB string (e.g. "rgb(255, 255, 255)")
 * @returns hex string (e.g. "#ffffff")
 */
const rgbToHex = (rgb: string): string => {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
};

const GradientPreview: React.FC<{ stops: ColorscaleInput["list"] }> = ({
  stops,
}) => {
  const gradient = useMemo(
    () => stops.map((stop) => `${stop.color} ${stop.value * 100}%`).join(", "),
    [stops]
  );

  return (
    <div
      style={{
        height: "40px",
        width: "100%",
        background: `linear-gradient(to right, ${gradient})`,
        borderRadius: "4px",
        marginBottom: "16px",
      }}
    />
  );
};

const ColorStopRow: React.FC<{
  stop: { value: number; color: string };
  index: number;
  total: number;
  onValueChange: (index: number, value: number) => void;
  onColorChange: (index: number, color: string) => void;
  onRemove: (index: number) => void;
}> = ({ stop, index, total, onValueChange, onColorChange, onRemove }) => {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const [localValue, setLocalValue] = useState(String(stop.value));

  const handleValueChange = (value: string) => {
    setLocalValue(value);
    // only update the actual value if it's a valid number between 0 and 1
    const num = Number(value);
    if (!isNaN(num) && num >= 0 && num <= 1) {
      onValueChange(index, num);
    }
  };

  useEffect(() => {
    setLocalValue(String(stop.value));
  }, [stop.value]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 40px 40px",
        gap: "8px",
        alignItems: "center",
        marginBottom: "8px",
      }}
    >
      <Input
        value={localValue}
        setter={handleValueChange}
        style={{ width: "100%" }}
        disabled={isFirst || isLast}
      />
      <Input
        value={stop.color}
        setter={(value) => onColorChange(index, value)}
        style={{ width: "100%" }}
      />
      <input
        type="color"
        value={stop.color}
        onChange={(e) => onColorChange(index, e.target.value)}
        style={{
          width: "32px",
          height: "32px",
          padding: 0,
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      />
      {!isFirst && !isLast && (
        <IconButton
          onClick={() => onRemove(index)}
          size="small"
          style={{
            padding: "4px",
            color: "#666",
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      )}
    </div>
  );
};

const PcdColormapModal: React.FC<PcdColormapModalProps> = ({
  isOpen,
  onClose,
  attribute,
  onSave,
  initialColorscale,
}) => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const [hasChanges, setHasChanges] = useState(false);

  const defaultValue = useMemo(
    () => [
      {
        value: 0,
        color: rgbToHex(getRGBColorFromPool(colorScheme.colorPool)),
      },
      {
        value: 1,
        color: rgbToHex(getRGBColorFromPool(colorScheme.colorPool)),
      },
    ],
    [colorScheme.colorPool]
  );

  const [colorList, setColorList] = useState(() => {
    if (initialColorscale?.list && initialColorscale.list.length > 0) {
      return initialColorscale.list;
    }
    if (initialColorscale?.name) {
      return getGradientFromSchemeName(initialColorscale.name);
    }
    return defaultValue;
  });

  const handleSave = useCallback(() => {
    onSave(colorList);
    setHasChanges(false);
  }, [colorList, onSave]);

  const handleColorChange = (index: number, color: string) => {
    const newList = [...colorList];
    newList[index] = { ...newList[index], color };
    setColorList(newList);
    setHasChanges(true);
  };

  const handleValueChange = (index: number, value: number) => {
    const newList = [...colorList];
    newList[index] = { ...newList[index], value };
    newList.sort((a, b) => a.value - b.value);
    setColorList(newList);
    setHasChanges(true);
  };

  const addColorStop = () => {
    const newList = [...colorList];
    // find the largest gap between adjacent stops
    let maxGap = 0;
    let insertIndex = 0;

    for (let i = 0; i < newList.length - 1; i++) {
      const gap = newList[i + 1].value - newList[i].value;
      if (gap > maxGap) {
        maxGap = gap;
        insertIndex = i;
      }
    }

    // calculate midpoint between the stops with the largest gap
    const midValue =
      (newList[insertIndex].value + newList[insertIndex + 1].value) / 2;

    // insert the new stop at the midpoint
    newList.splice(insertIndex + 1, 0, {
      value: midValue,
      color: rgbToHex(getRGBColorFromPool(colorScheme.colorPool)),
    });

    setColorList(newList);
    setHasChanges(true);
  };

  const removeColorStop = (index: number) => {
    // keep at least two stops
    if (colorList.length <= 2) return;
    const newList = colorList.filter((_, i) => i !== index);
    setColorList(newList);
    setHasChanges(true);
  };

  return (
    <Dialog
      id="pcdAttributesColorModal"
      open={isOpen}
      onClose={onClose}
      style={{ zIndex: 2000 }}
    >
      <div style={{ minHeight: "400px", minWidth: "500px", padding: "1rem" }}>
        <h2 id={`colormap-modal-${attribute}`}>Colormap for {attribute}</h2>
        <div style={{ padding: "1rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            Define a custom colorscale (range between 0 and 1):
            <br />* must include 0 and 1
          </div>
          <GradientPreview stops={colorList} />
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 40px 40px",
                gap: "8px",
                marginBottom: "8px",
                color: "#666",
                fontSize: "0.9rem",
              }}
            >
              <div>Value</div>
              <div>Color</div>
              <div></div>
              <div></div>
            </div>
            {colorList.map((stop, index) => (
              <ColorStopRow
                key={index}
                stop={stop}
                index={index}
                total={colorList.length}
                onValueChange={handleValueChange}
                onColorChange={handleColorChange}
                onRemove={removeColorStop}
              />
            ))}
          </div>
          <Button
            onClick={addColorStop}
            style={{
              marginTop: "8px",
              backgroundColor: "#f0f0f0",
              color: "#333",
            }}
          >
            Add Color Stop
          </Button>
          <div style={{ marginTop: "1rem", textAlign: "right" }}>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              style={{
                opacity: hasChanges ? 1 : 0.5,
                cursor: hasChanges ? "pointer" : "not-allowed",
              }}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default PcdColormapModal;
