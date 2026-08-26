import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import type { StateActionStats } from "../../../ports";
import { SettingsLabel } from "../settings/controls/SettingsLabel";
import { SettingsSelect } from "../settings/controls/SettingsSelect";
import settingsStyles from "../tiles/Tile.settings.module.css";
import { useStateActionContext } from "./state-action-context";
import {
  STATE_ACTION_VALUE_MODES,
  stateActionValueModeAtom,
  type StateActionValueMode,
} from "./state-action-display";

const VALUE_SCALE_TOOLTIP =
  "Z-score is (v − mean) / std; Quantile maps q01–q99 onto [−1, 1] — both from the dataset-declared statistics. Copy always yields the raw exact value.";

/**
 * Settings sidebar for the State & Action tile: the value display scale.
 * Schema facts and statistics live in the Statistics tab, not here.
 */
const StateActionTileSettings: React.FC = () => {
  const { readDimensionStats } = useStateActionContext();
  const [valueMode, setValueMode] = useAtom(stateActionValueModeAtom);
  const [stats, setStats] = useState<StateActionStats | null | "loading">(
    "loading",
  );

  // This effect resolves whether declared statistics exist so the panel
  // can say when a normalized scale has nothing to normalize with.
  useEffect(() => {
    const controller = new AbortController();
    readDimensionStats(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setStats(result);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [readDimensionStats]);

  return (
    <div
      className={settingsStyles.root}
      data-cy="episode-state-action-settings"
    >
      <label className={settingsStyles.field}>
        <SettingsLabel label="Value scale" tooltip={VALUE_SCALE_TOOLTIP} />
        <SettingsSelect
          ariaLabel="Value scale"
          onChange={(next) => setValueMode(next as StateActionValueMode)}
          options={STATE_ACTION_VALUE_MODES}
          value={valueMode}
        />
        {valueMode !== "raw" && stats === null ? (
          <span className={settingsStyles.emptyText}>
            This source declares no statistics (meta/stats.json); raw values are
            shown.
          </span>
        ) : null}
      </label>
    </div>
  );
};

export default StateActionTileSettings;
