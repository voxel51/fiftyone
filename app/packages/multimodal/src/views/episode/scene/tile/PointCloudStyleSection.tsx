import { Dialog } from "@fiftyone/components";
import {
  Button,
  FormField,
  FormFieldGroup,
  Input,
  InputType,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
  ZIndex,
} from "@voxel51/voodo";
import type { Descriptor } from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import {
  colormapCssGradient,
  POINT_CLOUD_COLORMAP_LABELS,
  POINT_CLOUD_COLORMAPS,
  DEFAULT_POINT_CLOUD_COLORMAP,
  getGradientFromSchemeName,
  getPointCloudColormapStops,
  interpolateHexColors,
  MAX_POINT_CLOUD_COLORMAP_STOPS,
  MIN_POINT_CLOUD_COLORMAP_STOPS,
  normalizeColorStops,
  normalizePointCloudColormap,
  pointCloudColormapKey,
  pointCloudColormapLabel,
  type PointCloudColorStop,
  type PointCloudColormap,
  type PointCloudColormapName,
} from "../../../../visualization/scene-3d/index";
import {
  DEFAULT_POINT_CLOUD_COLOR,
  MAX_POINT_CLOUD_POINT_SIZE,
  POINT_CLOUD_POINT_SIZE_STEP,
  MIN_POINT_CLOUD_POINT_SIZE,
  type PersistedPointCloudColorSettings,
} from "../../settings/modal/state";
import { settingsBooleanNoSpaceToggleProps } from "../../settings/controls/settings-keyboard";
import { SettingsNumberField } from "../../settings/controls/SettingsNumberField";
import { SettingsNumberInput } from "../../settings/controls/SettingsNumberInput";
import { SettingsLabel } from "../../settings/controls/SettingsLabel";
import settingsStyles from "../../tiles/Tile.settings.module.css";
import type { PointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";

/** Shared appearance controls shown once above the point-cloud source rows. */
export function PointCloudDisplayControls({
  pointCloudPointSize,
  setPointCloudPointSize,
  setShowPointCloudColorLegend,
  showPointCloudColorLegend,
}: {
  readonly pointCloudPointSize: number;
  readonly setPointCloudPointSize: (pointSize: number) => void;
  readonly setShowPointCloudColorLegend: (visible: boolean) => void;
  readonly showPointCloudColorLegend: boolean;
}) {
  return (
    <div className={settingsStyles.sharedDisplayControls}>
      <SettingsNumberInput
        label="Point size (px)"
        max={MAX_POINT_CLOUD_POINT_SIZE}
        min={MIN_POINT_CLOUD_POINT_SIZE}
        onChange={setPointCloudPointSize}
        step={POINT_CLOUD_POINT_SIZE_STEP}
        tooltip="Global point sprite size in screen pixels for all point clouds in this 3D view."
        value={pointCloudPointSize}
      />
      <div className={settingsStyles.field}>
        <div className={settingsStyles.sectionHeader}>
          <SettingsLabel
            label="Color legend"
            tooltip="Shows the active scalar color ramps in the top-left of the 3D view."
          />
          <Toggle
            aria-label="Show point cloud color legend"
            checked={showPointCloudColorLegend}
            onChange={setShowPointCloudColorLegend}
            size={Size.Sm}
            {...settingsBooleanNoSpaceToggleProps}
          />
        </div>
      </div>
    </div>
  );
}

/** Compact per-source color preview that discloses the full style editor. */
export function PointCloudStyleButton({
  customized,
  disabled,
  expanded,
  onClick,
  settings,
  sourceLabel,
}: {
  readonly customized: boolean;
  readonly disabled: boolean;
  readonly expanded: boolean;
  readonly onClick: () => void;
  readonly settings: PersistedPointCloudColorSettings;
  readonly sourceLabel: string;
}) {
  const summary = pointCloudStyleSummary(settings);
  const className = customized
    ? `${settingsStyles.pointCloudStyleButton} ${settingsStyles.pointCloudStyleButtonCustomized}`
    : settingsStyles.pointCloudStyleButton;

  return (
    <button
      aria-expanded={expanded}
      aria-label={`Edit style for ${sourceLabel}: ${summary}${customized ? ", custom" : ""}`}
      className={className}
      disabled={disabled}
      onClick={onClick}
      title={`${summary}${customized ? " · custom" : ""}`}
      type="button"
    >
      <PointCloudStylePreview settings={settings} />
      <span
        aria-hidden="true"
        className={settingsStyles.pointCloudStyleChevron}
      >
        {expanded ? "▴" : "▾"}
      </span>
    </button>
  );
}

/** Full color editor revealed beneath one point-cloud source row. */
export function PointCloudStyleEditor({
  capabilities,
  customized,
  defaultSettings,
  onChange,
  onReset,
  settings,
  sourceLabel,
}: {
  readonly capabilities?: PointCloudColorCapabilities;
  readonly customized: boolean;
  readonly defaultSettings: PersistedPointCloudColorSettings;
  readonly onChange: (
    settings: Partial<PersistedPointCloudColorSettings>,
  ) => void;
  readonly onReset: () => void;
  readonly settings: PersistedPointCloudColorSettings;
  readonly sourceLabel: string;
}) {
  return (
    <div className={settingsStyles.colorSourceEditor}>
      <PointCloudColorControls
        capabilities={capabilities}
        defaultColormap={defaultSettings.colormap}
        onChange={onChange}
        settings={settings}
        sourceLabel={sourceLabel}
      />
      {customized ? (
        <Button
          aria-label={`Reset style for ${sourceLabel}`}
          onClick={onReset}
          size={Size.Xs}
          variant={Variant.Secondary}
        >
          Reset style
        </Button>
      ) : null}
    </div>
  );
}

// Color-by modes with fixed meanings; every other select value is a
// decoded scalar channel name.
const RESERVED_COLOR_BY_MODES: ReadonlySet<string> = new Set([
  "auto",
  "height",
  "rgb",
  "uniform",
]);

const CUSTOM_COLORMAP_SELECT_VALUE = "__custom__";

type SelectLabelDescriptor = Descriptor<{
  label: string;
  content?: React.ReactNode;
}>;

const COLORMAP_SELECT_OPTIONS: SelectLabelDescriptor[] = [
  ...POINT_CLOUD_COLORMAPS.map((colormap) => ({
    data: { label: POINT_CLOUD_COLORMAP_LABELS[colormap] },
    id: colormap,
  })),
  {
    data: { label: "Custom..." },
    id: CUSTOM_COLORMAP_SELECT_VALUE,
  },
];

const PRESET_COLORMAP_OPTIONS: SelectLabelDescriptor[] =
  POINT_CLOUD_COLORMAPS.map((colormap) => ({
    data: { label: POINT_CLOUD_COLORMAP_LABELS[colormap] },
    id: colormap,
  }));

type EditablePointCloudColorStop = PointCloudColorStop & {
  readonly id: string;
};

let nextPointCloudColorStopId = 0;

function PointCloudStylePreview({
  settings,
}: {
  readonly settings: PersistedPointCloudColorSettings;
}) {
  if (settings.colorBy === "rgb") {
    return (
      <span className={settingsStyles.pointCloudStyleModePreview}>RGB</span>
    );
  }

  const background =
    settings.colorBy === "uniform"
      ? settings.uniformColor
      : colormapCssGradient(normalizePointCloudColormap(settings.colormap));

  return (
    <span
      aria-hidden="true"
      className={settingsStyles.pointCloudStylePreview}
      style={{ background }}
    />
  );
}

function pointCloudStyleSummary(
  settings: PersistedPointCloudColorSettings,
): string {
  const parts = [pointCloudColorByLabel(settings.colorBy)];
  if (settings.colorBy !== "rgb" && settings.colorBy !== "uniform") {
    parts.push(pointCloudColormapLabel(settings.colormap));
  }
  const range = pointCloudRangeLabel(settings);
  if (range) {
    parts.push(range);
  }
  return parts.join(" · ");
}

function pointCloudColorByLabel(colorBy: string): string {
  switch (colorBy) {
    case "auto":
      return "Auto";
    case "height":
      return "Height";
    case "rgb":
      return "RGB";
    case "uniform":
      return "Uniform";
    default:
      return colorBy;
  }
}

function pointCloudRangeLabel({
  rangeMax,
  rangeMin,
}: PersistedPointCloudColorSettings): string | null {
  if (rangeMin === null && rangeMax === null) {
    return null;
  }

  return `${rangeMin ?? "auto"}..${rangeMax ?? "auto"}`;
}

/** Returns whether a source still uses its derived point-cloud defaults. */
export function isDefaultPointCloudColorSettings(
  settings: PersistedPointCloudColorSettings,
  defaultSettings = DEFAULT_POINT_CLOUD_COLOR,
): boolean {
  return (
    settings.colorBy === defaultSettings.colorBy &&
    pointCloudColormapKey(settings.colormap) ===
      pointCloudColormapKey(defaultSettings.colormap) &&
    settings.rangeMax === defaultSettings.rangeMax &&
    settings.rangeMin === defaultSettings.rangeMin &&
    settings.uniformColor === defaultSettings.uniformColor
  );
}

/**
 * Per-source point-cloud color controls: channel select, colormap, and an
 * optional fixed normalization range. Channel options are the channels the
 * stream has actually been observed to carry; a persisted selection that no
 * longer matches stays listed so the select reflects what is applied.
 */
function PointCloudColorControls({
  capabilities,
  defaultColormap = DEFAULT_POINT_CLOUD_COLORMAP,
  onChange,
  settings,
  sourceLabel,
}: {
  readonly capabilities?: PointCloudColorCapabilities;
  readonly defaultColormap?: PointCloudColormap;
  readonly onChange: (
    settings: Partial<PersistedPointCloudColorSettings>,
  ) => void;
  readonly settings: PersistedPointCloudColorSettings;
  readonly sourceLabel?: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const scalarFields = capabilities?.scalarFields;
  const fieldOptions = useMemo(() => {
    const fields = scalarFields ?? [];
    return !RESERVED_COLOR_BY_MODES.has(settings.colorBy) &&
      !fields.includes(settings.colorBy)
      ? [...fields, settings.colorBy]
      : fields;
  }, [scalarFields, settings.colorBy]);
  const label = sourceLabel ? `Color (${sourceLabel})` : "Color";
  const colorByOptions = useMemo<Descriptor<{ label: string }>[]>(
    () => [
      { data: { label: "Auto" }, id: "auto" },
      { data: { label: "Height" }, id: "height" },
      ...fieldOptions.map((field) => ({
        data: { label: field },
        id: field,
      })),
      ...(capabilities?.hasRgb ? [{ data: { label: "RGB" }, id: "rgb" }] : []),
      { data: { label: "Uniform" }, id: "uniform" },
    ],
    [capabilities?.hasRgb, fieldOptions],
  );
  const normalizedColormap = normalizePointCloudColormap(settings.colormap);
  const colormapSelectValue =
    typeof normalizedColormap === "string"
      ? normalizedColormap
      : CUSTOM_COLORMAP_SELECT_VALUE;
  const rampActive =
    settings.colorBy !== "rgb" && settings.colorBy !== "uniform";
  const uniformActive = settings.colorBy === "uniform";
  const rangeInvalid =
    settings.rangeMin !== null &&
    settings.rangeMax !== null &&
    settings.rangeMin >= settings.rangeMax;

  return (
    <div className={settingsStyles.field}>
      <FormField
        label={
          <SettingsLabel
            label={label}
            tooltip="Per-point channel driving this cloud's colors. Auto prefers explicit RGB, then sensor-return channels like intensity, then height."
          />
        }
        control={
          <Select
            aria-label={label}
            exclusive
            onChange={(value) => {
              if (typeof value === "string") {
                onChange({ colorBy: value });
              }
            }}
            options={colorByOptions}
            portal
            zIndex={ZIndex.AboveModal}
            value={settings.colorBy}
          />
        }
      />
      {uniformActive ? (
        <FormField
          label={
            <SettingsLabel
              label="Uniform color"
              tooltip="Single color applied to every rendered point in this cloud."
            />
          }
          control={
            <input
              aria-label={
                sourceLabel ? `Uniform color (${sourceLabel})` : "Uniform color"
              }
              className={settingsStyles.select}
              onChange={(event) =>
                onChange({ uniformColor: event.target.value })
              }
              type="color"
              value={
                settings.uniformColor || DEFAULT_POINT_CLOUD_COLOR.uniformColor
              }
            />
          }
        />
      ) : null}
      {rampActive ? (
        <FormFieldGroup orientation={Orientation.Column} spacing={Spacing.Sm}>
          <FormField
            label={
              <SettingsLabel
                label="Colormap"
                tooltip="Ramp mapping the selected channel's values to colors. Enable the legend to show the active ramp and range in the 3D view."
              />
            }
            control={
              <Select
                aria-label={
                  sourceLabel ? `Colormap (${sourceLabel})` : "Colormap"
                }
                exclusive
                onChange={(value) => {
                  if (value === CUSTOM_COLORMAP_SELECT_VALUE) {
                    setEditorOpen(true);
                    return;
                  }
                  if (typeof value === "string") {
                    onChange({
                      colormap: value as PointCloudColormapName,
                    });
                  }
                }}
                options={COLORMAP_SELECT_OPTIONS}
                portal
                zIndex={ZIndex.AboveModal}
                value={colormapSelectValue}
              />
            }
          />
          <div
            aria-label={`${label} colormap preview`}
            className={settingsStyles.colorPreview}
            style={{ background: colormapCssGradient(normalizedColormap) }}
          />
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Button
              onClick={() => setEditorOpen(true)}
              size={Size.Xs}
              variant={Variant.Secondary}
            >
              Edit colormap
            </Button>
            <Button
              onClick={() => onChange({ colormap: defaultColormap })}
              size={Size.Xs}
              variant={Variant.Secondary}
            >
              Default colormap
            </Button>
          </Stack>
          <SettingsNullableNumberInput
            label="Range min"
            onChange={(rangeMin) => onChange({ rangeMin })}
            tooltip="Lower end of a fixed color range. Leave empty to normalize against each frame's own minimum."
            value={settings.rangeMin}
          />
          <SettingsNullableNumberInput
            label="Range max"
            onChange={(rangeMax) => onChange({ rangeMax })}
            tooltip="Upper end of a fixed color range. Leave empty to normalize against each frame's own maximum."
            value={settings.rangeMax}
          />
          {rangeInvalid ? (
            <span className={settingsStyles.emptyText}>
              The fixed range is ignored until min is below max.
            </span>
          ) : null}
          <PointCloudColormapEditor
            colormap={normalizedColormap}
            isOpen={editorOpen}
            onClose={() => setEditorOpen(false)}
            onSave={(colormap) => {
              onChange({ colormap });
              setEditorOpen(false);
            }}
            sourceLabel={sourceLabel}
          />
        </FormFieldGroup>
      ) : null}
    </div>
  );
}

function PointCloudColormapEditor({
  colormap,
  isOpen,
  onClose,
  onSave,
  sourceLabel,
}: {
  readonly colormap: PointCloudColormap;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (colormap: PointCloudColormap) => void;
  readonly sourceLabel?: string;
}) {
  const [edited, setEdited] = useState(false);
  const [numStops, setNumStops] = useState("");
  const [selectedPreset, setSelectedPreset] =
    useState<PointCloudColormapName | null>(null);
  const [stops, setStops] = useState<readonly EditablePointCloudColorStop[]>(
    [],
  );
  const title = `Colormap${sourceLabel ? ` (${sourceLabel})` : ""}`;

  // This effect seeds the editor whenever the colormap dialog opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const normalized = normalizePointCloudColormap(colormap);
    const normalizedStops = getPointCloudColormapStops(normalized);
    setSelectedPreset(typeof normalized === "string" ? normalized : null);
    setStops(editableColorStops(normalizedStops));
    setNumStops(String(normalizedStops.length));
    setEdited(false);
  }, [colormap, isOpen]);

  const normalizedStops = normalizeColorStops(stops) ?? [
    ...getGradientFromSchemeName(DEFAULT_POINT_CLOUD_COLORMAP),
  ];
  const stopCount = Number(numStops);
  const stopCountValid =
    Number.isInteger(stopCount) &&
    stopCount >= MIN_POINT_CLOUD_COLORMAP_STOPS &&
    stopCount <= MAX_POINT_CLOUD_COLORMAP_STOPS;

  const handlePresetChange = (value: string | string[] | null) => {
    if (typeof value !== "string") {
      return;
    }
    const preset = value as PointCloudColormapName;
    setSelectedPreset(preset);
    const nextStops = getGradientFromSchemeName(preset);
    setStops(editableColorStops(nextStops));
    setNumStops(String(nextStops.length));
    setEdited(false);
  };

  const updateStop = (index: number, patch: Partial<PointCloudColorStop>) => {
    setStops((current) =>
      current
        .map((stop, stopIndex) =>
          stopIndex === index ? { ...stop, ...patch } : stop,
        )
        .sort((a, b) => a.value - b.value),
    );
    setEdited(true);
  };

  const removeStop = (index: number) => {
    if (stops.length <= MIN_POINT_CLOUD_COLORMAP_STOPS) {
      return;
    }
    setStops((current) =>
      current.filter((_, stopIndex) => stopIndex !== index),
    );
    setEdited(true);
  };

  const addStop = () => {
    const sorted = [...stops].sort((a, b) => a.value - b.value);
    let insertIndex = 0;
    let largestGap = -1;
    for (let index = 0; index < sorted.length - 1; index++) {
      const gap = sorted[index + 1].value - sorted[index].value;
      if (gap > largestGap) {
        largestGap = gap;
        insertIndex = index;
      }
    }
    const lower = sorted[insertIndex];
    const upper = sorted[insertIndex + 1];
    const value = (lower.value + upper.value) / 2;
    const color = interpolateHexColors(lower.color, upper.color, 0.5);
    setStops(
      [
        ...sorted.slice(0, insertIndex + 1),
        editableColorStop({ color, value }),
        ...sorted.slice(insertIndex + 1),
      ].sort((a, b) => a.value - b.value),
    );
    setEdited(true);
  };

  const applyStopCount = () => {
    if (!stopCountValid) {
      return;
    }
    if (selectedPreset) {
      setStops(
        editableColorStops(
          getGradientFromSchemeName(selectedPreset, stopCount),
        ),
      );
    } else {
      setStops(
        editableColorStops(redistributeStops(normalizedStops, stopCount)),
      );
    }
    setEdited(true);
  };

  const save = () => {
    const list = normalizeColorStops(stops);
    if (!edited && selectedPreset) {
      onSave(selectedPreset);
      return;
    }
    if (list) {
      onSave({
        list,
        name: selectedPreset
          ? `${POINT_CLOUD_COLORMAP_LABELS[selectedPreset]} custom`
          : "Custom",
      });
    }
  };

  return (
    <Dialog
      id="episodePointCloudColormapEditor"
      onClose={onClose}
      open={isOpen}
      style={{ zIndex: 2000 }}
    >
      <Stack
        className={settingsStyles.colormapEditor}
        orientation={Orientation.Column}
        spacing={Spacing.Md}
      >
        <Text variant={TextVariant.Lg} color={TextColor.Primary}>
          {title}
        </Text>
        <FormField
          label="Preset"
          control={
            <Select
              aria-label="Preset"
              exclusive
              onChange={handlePresetChange}
              options={PRESET_COLORMAP_OPTIONS}
              portal
              zIndex={ZIndex.AboveModal}
              value={selectedPreset ?? ""}
            />
          }
        />
        <div
          aria-label="Colormap preview"
          className={settingsStyles.colorPreviewLarge}
          style={{ background: colormapCssGradient({ list: normalizedStops }) }}
        />
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Input
            aria-label="Number of stops"
            error={numStops !== "" && !stopCountValid}
            max={MAX_POINT_CLOUD_COLORMAP_STOPS}
            min={MIN_POINT_CLOUD_COLORMAP_STOPS}
            onChange={(event) => setNumStops(event.target.value)}
            size={Size.Sm}
            type={InputType.Number}
            value={numStops}
          />
          <Button
            disabled={!stopCountValid}
            onClick={applyStopCount}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            Apply
          </Button>
        </Stack>
        <div className={settingsStyles.colorStopHeader}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Value
          </Text>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Color
          </Text>
          <span />
          <span />
        </div>
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          {stops.map((stop, index) => (
            <ColorStopRow
              index={index}
              key={stop.id}
              onColorChange={(color) => updateStop(index, { color })}
              onRemove={() => removeStop(index)}
              onValueChange={(value) => updateStop(index, { value })}
              removable={
                index !== 0 &&
                index !== stops.length - 1 &&
                stops.length > MIN_POINT_CLOUD_COLORMAP_STOPS
              }
              stop={stop}
            />
          ))}
        </Stack>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Button onClick={addStop} size={Size.Xs} variant={Variant.Secondary}>
            Add stop
          </Button>
          <Button onClick={save} size={Size.Xs}>
            Save
          </Button>
          <Button onClick={onClose} size={Size.Xs} variant={Variant.Secondary}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
}

function ColorStopRow({
  index,
  onColorChange,
  onRemove,
  onValueChange,
  removable,
  stop,
}: {
  readonly index: number;
  readonly onColorChange: (color: string) => void;
  readonly onRemove: () => void;
  readonly onValueChange: (value: number) => void;
  readonly removable: boolean;
  readonly stop: PointCloudColorStop;
}) {
  return (
    <div className={settingsStyles.colorStopRow}>
      <Input
        aria-label={`Color stop ${index + 1} value`}
        disabled={!removable}
        max={1}
        min={0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0 && next <= 1) {
            onValueChange(next);
          }
        }}
        size={Size.Sm}
        step={0.01}
        type={InputType.Number}
        value={stop.value}
      />
      <Input
        aria-label={`Color stop ${index + 1} color`}
        onChange={(event) => onColorChange(event.target.value)}
        size={Size.Sm}
        value={stop.color}
      />
      <input
        aria-label={`Color stop ${index + 1} swatch`}
        className={settingsStyles.colorSwatchInput}
        onChange={(event) => onColorChange(event.target.value)}
        type="color"
        value={stop.color}
      />
      {removable ? (
        <Button onClick={onRemove} size={Size.Xs} variant={Variant.Secondary}>
          Remove
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function editableColorStops(
  stops: readonly PointCloudColorStop[],
): readonly EditablePointCloudColorStop[] {
  return stops.map(editableColorStop);
}

function editableColorStop(
  stop: PointCloudColorStop,
): EditablePointCloudColorStop {
  nextPointCloudColorStopId += 1;
  return {
    ...stop,
    id: `point-cloud-color-stop-${nextPointCloudColorStopId}`,
  };
}

function redistributeStops(
  stops: readonly PointCloudColorStop[],
  count: number,
): readonly PointCloudColorStop[] {
  const next: PointCloudColorStop[] = [];
  for (let index = 0; index < count; index++) {
    const value = index / (count - 1);
    const [lower, upper] = boundingStops(stops, value);
    const span = upper.value - lower.value;
    const factor = span > 0 ? (value - lower.value) / span : 0;
    next.push({
      color: interpolateHexColors(lower.color, upper.color, factor),
      value,
    });
  }
  return next;
}

function boundingStops(
  stops: readonly PointCloudColorStop[],
  value: number,
): readonly [PointCloudColorStop, PointCloudColorStop] {
  for (let index = 0; index < stops.length - 1; index++) {
    const lower = stops[index];
    const upper = stops[index + 1];
    if (lower.value <= value && upper.value >= value) {
      return [lower, upper];
    }
  }
  const last = stops[stops.length - 1];
  return [last, last];
}

function SettingsNullableNumberInput({
  label,
  onChange,
  tooltip,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: number | null) => void;
  readonly tooltip: string;
  readonly value: number | null;
}) {
  return (
    <FormField
      label={<SettingsLabel label={label} tooltip={tooltip} />}
      control={
        <SettingsNumberField
          ariaLabel={label}
          empty="null"
          onCommit={onChange}
          placeholder="auto"
          value={value}
        />
      }
    />
  );
}
