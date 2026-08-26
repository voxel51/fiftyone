import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import type {
  StateActionFeatureSchema,
  StateActionStats,
} from "../../../ports";
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
  "How the tile displays numeric values. Z-score shows (v − mean) / std and Quantile maps q01–q99 onto [−1, 1], both from the dataset-declared statistics — the scales normalization-trained policies actually see. Copy always yields the raw exact value.";

/**
 * Settings sidebar for the State & Action tile: the value display scale
 * plus the declared schema facts practitioners reconcile against.
 */
const StateActionTileSettings: React.FC = () => {
  const { ensureSchema, readDimensionStats, schema } = useStateActionContext();
  const [valueMode, setValueMode] = useAtom(stateActionValueModeAtom);
  const [stats, setStats] = useState<StateActionStats | null | "loading">(
    "loading",
  );

  // This effect republishes the session schema in case a shell remount
  // wiped the bridge's initial publication before this panel opened.
  useEffect(() => {
    ensureSchema();
  }, [ensureSchema]);

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

  const facts = schema.status === "ready" ? schema.schema : null;
  if (!facts) {
    return (
      <div className={settingsStyles.root}>
        <span className={settingsStyles.emptyText}>
          Reading the state/action schema…
        </span>
      </div>
    );
  }
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
      <span className={settingsStyles.metaText}>
        {`Exact per-row values · ${facts.rowCount.toLocaleString()} episode rows. Declared per-dimension statistics live in the Statistics tab.`}
      </span>
      <FeatureFacts feature={facts.state} missingName="observation.state" />
      <FeatureFacts feature={facts.action} missingName="action" />
    </div>
  );
};

function FeatureFacts({
  feature,
  missingName,
}: {
  readonly feature?: StateActionFeatureSchema;
  readonly missingName: string;
}) {
  if (!feature) {
    return (
      <span className={settingsStyles.emptyText}>
        {`No ${missingName} feature declared`}
      </span>
    );
  }
  const named = feature.dimensions.filter(
    (dimension) => dimension.name !== undefined,
  ).length;
  return (
    <div className={settingsStyles.field}>
      <span className={settingsStyles.metaText}>
        {`${feature.featureName} — ${feature.dtype} [${feature.shape.join(",")}], ${feature.dimensions.length} dimensions${
          named ? ` (${named} named)` : ""
        }`}
      </span>
    </div>
  );
}

export default StateActionTileSettings;
