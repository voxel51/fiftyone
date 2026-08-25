import React, { useEffect } from "react";
import type { StateActionFeatureSchema } from "../../../ports";
import settingsStyles from "../tiles/Tile.settings.module.css";
import { useStateActionContext } from "./state-action-context";

/**
 * Settings sidebar for the State & Action tile. The tile has no
 * configuration — the two canonical features are fixed — so this panel
 * states the declared schema facts practitioners reconcile against:
 * feature dtypes, shapes, dimension counts, and the episode row count.
 */
const StateActionTileSettings: React.FC = () => {
  const { ensureSchema, schema } = useStateActionContext();

  // This effect republishes the session schema in case a shell remount
  // wiped the bridge's initial publication before this panel opened.
  useEffect(() => {
    ensureSchema();
  }, [ensureSchema]);

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
      <span className={settingsStyles.metaText}>
        {`Exact per-row values from ${facts.rowCount.toLocaleString()} episode rows. The playhead selects a row; every displayed value comes from that one source row.`}
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
