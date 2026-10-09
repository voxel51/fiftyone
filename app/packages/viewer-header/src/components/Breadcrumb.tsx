/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Text,
  TextBadge,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import styles from "../ViewerHeader.module.css";

/** Where the sample is: its dataset, which leads back, and its name. */
const Breadcrumb = ({
  dataset,
  onDataset,
  sample,
  slice,
}: {
  dataset: string;
  onDataset: () => void;
  sample?: string;
  slice?: string | null;
}) => (
  <div className={styles.crumbs}>
    <button
      type="button"
      className={styles.dataset}
      onClick={onDataset}
      data-cy="viewer-header-dataset"
    >
      <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
        {dataset}
      </Text>
    </button>
    <Text
      className={styles.datasetSlash}
      variant={TextVariant.BodySecondary}
      color={TextColor.Tertiary}
    >
      /
    </Text>
    <Text
      className={styles.title}
      variant={TextVariant.HeadingSm}
      color={TextColor.Foreground}
      data-cy="viewer-header-title"
    >
      {sample}
    </Text>
    {slice && (
      <Tooltip anchor="bottom" content="Group slice" portal>
        <TextBadge color={TextColor.Secondary} data-cy="viewer-header-slice">
          {slice}
        </TextBadge>
      </Tooltip>
    )}
  </div>
);

export default Breadcrumb;
