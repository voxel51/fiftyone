import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useEffect, useState } from "react";

import {
  MAX_TIMELINE_SAMPLING_RATE_HZ,
  MIN_TIMELINE_SAMPLING_RATE_HZ,
  normalizeTimelineSamplingRateHz,
  TIMELINE_SAMPLING_PRESETS,
  timelineSamplingPresetForRate,
  type TimelineSamplingPresetId,
} from "../../playback/timeline-sampling";
import { SettingsLabel } from "../controls/SettingsLabel";
import { SettingsNumberField } from "../controls/SettingsNumberField";
import { SettingsSelect } from "../controls/SettingsSelect";
import SidebarGroup from "../controls/SidebarGroup";
import settingsStyles from "../../tiles/Tile.settings.module.css";

const CUSTOM_PRESET_ID = "custom";
type SamplingSelection = TimelineSamplingPresetId | typeof CUSTOM_PRESET_ID;

const SAMPLING_OPTIONS = [
  ...TIMELINE_SAMPLING_PRESETS.map((preset) => ({
    label: `${preset.label} · ${preset.rateHz} Hz`,
    value: preset.id,
  })),
  { label: "Custom…", value: CUSTOM_PRESET_ID },
];

const SAMPLING_TOOLTIP =
  "How often episode streams are synchronized to playback. Higher rates reduce time quantization but increase read, cache, and decode work. The visual playhead still updates at display refresh rate.";

/** Episode-wide playback sampling controls shown in the Scene sidebar. */
export default function TimelinePlaybackSettings({
  onRateChange,
  rateHz,
}: {
  readonly onRateChange: (rateHz: number) => void;
  readonly rateHz: number;
}) {
  const preset = timelineSamplingPresetForRate(rateHz);
  const [selection, setSelection] = useState<SamplingSelection>(
    preset?.id ?? CUSTOM_PRESET_ID,
  );
  const [customRateHz, setCustomRateHz] = useState(rateHz);

  // External changes include source/dataset navigation restoring a different
  // persisted rate. Keep the control synchronized without disturbing an
  // uncommitted Custom draft for the current rate.
  useEffect(() => {
    const restoredPreset = timelineSamplingPresetForRate(rateHz);
    setSelection(restoredPreset?.id ?? CUSTOM_PRESET_ID);
    setCustomRateHz(rateHz);
  }, [rateHz]);

  const summary = preset
    ? `${preset.label} · ${preset.rateHz} Hz`
    : `Custom · ${rateHz} Hz`;

  const selectSampling = (value: string) => {
    if (value === CUSTOM_PRESET_ID) {
      setSelection(CUSTOM_PRESET_ID);
      setCustomRateHz(rateHz);
      return;
    }
    const next = TIMELINE_SAMPLING_PRESETS.find(
      (candidate) => candidate.id === value,
    );
    if (!next) return;
    setSelection(next.id);
    onRateChange(next.rateHz);
  };

  return (
    <SidebarGroup
      defaultExpanded={false}
      summary={summary}
      title="Playback"
      tooltip="Episode-wide timeline and data playback settings."
    >
      <label className={settingsStyles.field}>
        <SettingsLabel label="Data sampling" tooltip={SAMPLING_TOOLTIP} />
        <SettingsSelect
          ariaLabel="Data sampling preset"
          onChange={selectSampling}
          options={SAMPLING_OPTIONS}
          value={selection}
        />
      </label>
      {selection === CUSTOM_PRESET_ID ? (
        <div className={settingsStyles.field}>
          <SettingsLabel
            label="Custom rate"
            tooltip={`Whole-number sampling rate from ${MIN_TIMELINE_SAMPLING_RATE_HZ} to ${MAX_TIMELINE_SAMPLING_RATE_HZ} Hz.`}
          />
          <SettingsNumberField
            ariaLabel="Custom data sampling rate"
            max={MAX_TIMELINE_SAMPLING_RATE_HZ}
            min={MIN_TIMELINE_SAMPLING_RATE_HZ}
            onCommit={(value) =>
              setCustomRateHz(normalizeTimelineSamplingRateHz(value))
            }
            step={1}
            unit="Hz"
            value={customRateHz}
          />
          <button
            className={settingsStyles.recommendButton}
            disabled={customRateHz === rateHz}
            onClick={() => onRateChange(customRateHz)}
            type="button"
          >
            Apply sampling rate
          </button>
        </div>
      ) : null}
      <Text color={TextColor.Muted} variant={TextVariant.Xs}>
        Changing this setting rebuilds the playback buffer at the current time.
      </Text>
    </SidebarGroup>
  );
}
