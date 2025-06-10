import { Button, Dialog } from "@fiftyone/components";
import Selector from "@fiftyone/components/src/components/Selector/Selector";
import { getRGBColorFromPool } from "@fiftyone/core/src/components/ColorModal/utils";
import Input from "@fiftyone/core/src/components/Common/Input";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import { interpolateColorsHex, rgbStringToHex } from "@fiftyone/utilities";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import IconButton from "@mui/material/IconButton";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import tunnel from "tunnel-rat";
import { getGradientFromSchemeName } from "../renderables/pcd/shaders/gradientMap";

const COLORMAP_OPTIONS = [
  "Grayscale",
  "Inferno",
  "Jet",
  "Magma",
  "Plasma",
  "Turbo",
  "Viridis",
  "CyanToYellow",
  "Legacy",
] as const;

type ColormapType = typeof COLORMAP_OPTIONS[number];

interface PcdColormapModalProps {
  attribute: string;
  initialColorscale?: ColorscaleInput;
  isOpen: boolean;
  onClose: () => void;
  onSave: (colorscaleList: Readonly<ColorscaleInput["list"]>) => void;
}

export const PcdColorMapTunnel = tunnel();

const GradientPreview: React.FC<{
  stops: Readonly<ColorscaleInput["list"]>;
}> = ({ stops }) => {
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
  isNew?: boolean;
}> = ({
  stop,
  index,
  total,
  onValueChange,
  onColorChange,
  onRemove,
  isNew,
}) => {
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
        transition: "background-color 0.3s ease",
        backgroundColor: isNew ? "rgba(255, 128, 30, 0.1)" : "transparent",
        padding: "4px",
        borderRadius: "4px",
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
            width: "50px",
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
  const [newRowIndices, setNewRowIndices] = useState<Set<number>>(new Set());
  const [selectedColormap, setSelectedColormap] = useState<ColormapType | null>(
    null
  );

  const defaultValue = useMemo(
    () => [
      {
        value: 0,
        color: rgbStringToHex(getRGBColorFromPool(colorScheme.colorPool)),
      },
      {
        value: 1,
        color: rgbStringToHex(getRGBColorFromPool(colorScheme.colorPool)),
      },
    ],
    [colorScheme.colorPool]
  );

  const [numStops, setNumStops] = useState(
    initialColorscale?.list?.length ?? 20
  );

  const [colorList, setColorList] = useState(() => {
    if (initialColorscale?.list && initialColorscale.list.length > 0) {
      return initialColorscale.list;
    }
    if (initialColorscale?.name) {
      return getGradientFromSchemeName(initialColorscale.name, numStops);
    }
    return defaultValue;
  });

  const handleColormapSelect = useCallback(
    (value: string) => {
      const colormap = value as ColormapType;
      setSelectedColormap(colormap);
      setNumStops(colormap === "Legacy" ? 10 : 20);

      const gradient = getGradientFromSchemeName(colormap, numStops);
      setColorList(gradient);
      setHasChanges(true);
    },
    [numStops]
  );

  const handleSave = useCallback(() => {
    onSave(colorList);
    setHasChanges(false);
    setNewRowIndices(new Set());
  }, [colorList, onSave]);

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const newList = [...colorList];
      newList[index] = { ...newList[index], color };
      setColorList(newList);
      setHasChanges(true);
    },
    [colorList]
  );

  const handleValueChange = useCallback(
    (index: number, value: number) => {
      const newList = [...colorList];
      newList[index] = { ...newList[index], value };
      newList.sort((a, b) => a.value - b.value);
      setColorList(newList);
      setHasChanges(true);
    },
    [colorList]
  );

  const addColorStop = useCallback(() => {
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
      color: rgbStringToHex(getRGBColorFromPool(colorScheme.colorPool)),
    });

    setColorList(newList);
    // Add the new index to the set of new rows
    setNewRowIndices((prev) => new Set([...prev, insertIndex + 1]));
    setHasChanges(true);
  }, [colorList]);

  const removeColorStop = useCallback(
    (index: number) => {
      // keep at least two stops
      if (colorList.length <= 2) return;
      const newList = colorList.filter((_, i) => i !== index);
      setColorList(newList);
      // Remove the index from newRowIndices and adjust other indices
      setNewRowIndices((prev) => {
        const newSet = new Set<number>();
        prev.forEach((i) => {
          if (i < index) {
            newSet.add(i);
          } else if (i > index) {
            newSet.add(i - 1);
          }
        });
        return newSet;
      });
      setHasChanges(true);
    },
    [colorList]
  );

  const redistributeStops = useCallback(
    (newNumStops: number) => {
      if (!colorList || colorList.length < 2) return;

      const newStops: Array<{ value: number; color: string }> = [];
      for (let i = 0; i < newNumStops; i++) {
        const position = i / (newNumStops - 1);

        // find two stops that bound this position
        let lowerStop = colorList[0];
        let upperStop = colorList[colorList.length - 1];

        for (let j = 0; j < colorList.length - 1; j++) {
          if (
            colorList[j].value <= position &&
            colorList[j + 1].value >= position
          ) {
            lowerStop = colorList[j];
            upperStop = colorList[j + 1];
            break;
          }
        }

        // calculate interpolation factor
        const factor =
          (position - lowerStop.value) / (upperStop.value - lowerStop.value);

        newStops.push({
          value: position,
          color: interpolateColorsHex(lowerStop.color, upperStop.color, factor),
        });
      }

      setColorList(newStops);
      setHasChanges(true);
    },
    [colorList]
  );

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
            <Selector
              value={selectedColormap || ""}
              onSelect={handleColormapSelect}
              placeholder="Select a predefined colormap..."
              component={({ value }) => {
                return <div>{value}</div>;
              }}
              useSearch={(search: string) => ({
                values: COLORMAP_OPTIONS.filter((option) =>
                  option.toLowerCase().includes(search.toLowerCase())
                ),
              })}
              containerStyle={{ width: "100%", marginBottom: "16px" }}
            />
            {selectedColormap !== "Grayscale" &&
              selectedColormap !== "Legacy" &&
              selectedColormap !== "CyanToYellow" &&
              selectedColormap !== "Turbo" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div>
                    <span>Number of stops</span>
                    <div
                      style={{
                        color: "#666",
                        fontSize: "0.8rem",
                        marginLeft: "8px",
                        display: "inline-block",
                      }}
                    >
                      (Must be between 2 and 256 stops)
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Input
                      value={numStops === -1 ? "" : String(numStops)}
                      setter={(value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                          if (num >= 2 && num <= 256) {
                            setNumStops(num);
                          } else {
                            setNumStops(1);
                          }
                        } else {
                          setNumStops(-1);
                        }
                      }}
                      style={{ width: "100px" }}
                    />
                    <Button
                      onClick={() => {
                        if (selectedColormap) {
                          const gradient = getGradientFromSchemeName(
                            selectedColormap,
                            numStops
                          );
                          setColorList(gradient);
                          setHasChanges(true);
                        } else {
                          redistributeStops(numStops);
                        }
                      }}
                      disabled={numStops < 2 || numStops > 256}
                      style={{
                        opacity: numStops < 2 || numStops > 256 ? 0.5 : 1,
                      }}
                    >
                      Apply
                    </Button>
                    {colorList?.length && (
                      <span style={{ color: "#666", fontSize: "0.9rem" }}>
                        Current: {colorList.length} stops
                      </span>
                    )}
                  </div>
                </div>
              )}
          </div>
          <div style={{ marginBottom: "4px" }}>
            Define a custom colorscale (range between 0 and 1):
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
            {(colorList ?? []).map((stop, index) => (
              <ColorStopRow
                key={`${stop.value}-${stop.color}`}
                stop={stop}
                index={index}
                total={colorList?.length ?? 0}
                onValueChange={handleValueChange}
                onColorChange={handleColorChange}
                onRemove={removeColorStop}
                isNew={newRowIndices.has(index)}
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
