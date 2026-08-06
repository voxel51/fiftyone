import { fields as fieldsSelector, State } from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useRecoilValue } from "recoil";
import settingsStyles from "./McapTile.settings.module.css";

/**
 * "Fields" tab for the MM right sidebar: the FiftyOne schema/metadata
 * fields for the current sample, read from the same `fields()` selector the
 * classic (now-removed-in-Multimodal) sidebar uses. No new GraphQL query —
 * this is schema metadata already resolved by the dataset view.
 */
const McapFieldsSidebar: React.FC = () => {
  const sampleFields = useRecoilValue(
    fieldsSelector({ space: State.SPACE.SAMPLE }),
  );
  const nonPrivateFields = sampleFields.filter(
    (field) => field && !field.path.startsWith("_"),
  );

  if (nonPrivateFields.length === 0) {
    return (
      <span
        className={settingsStyles.emptyText}
        data-testid="mcap-fields-empty"
      >
        This dataset has no sample fields.
      </span>
    );
  }

  return (
    <div className={settingsStyles.root} data-testid="mcap-fields-body">
      {nonPrivateFields.map((field) => (
        <div className={settingsStyles.field} key={field.path}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {field.path}
          </Text>
          <Text variant={TextVariant.Xs} color={TextColor.Primary}>
            {field.ftype}
          </Text>
          {field.description ? (
            <span className={settingsStyles.metaText}>{field.description}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default McapFieldsSidebar;
