/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLocation } from "@fiftyone/location";
import { useClearModal } from "@fiftyone/state";
import {
  Align,
  Clickable,
  Divider,
  Icon,
  IconName,
  Orientation,
  RichButtonGroup,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import type { AppRoute } from "../location/routes";
import { useProduct } from "../product";
import styles from "./SamplePageHeader.module.css";

/** An icon action. Without `onClick` it is a placeholder, shown disabled. */
const Action = ({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
}) => (
  <Tooltip content={label}>
    <Clickable
      role="button"
      aria-label={label}
      aria-disabled={!onClick}
      tabIndex={onClick ? 0 : -1}
      className={onClick ? styles.action : styles.placeholder}
      onClick={onClick}
    >
      <Icon name={icon} size={Size.Md} />
    </Clickable>
  </Tooltip>
);

const Separator = () => (
  <Divider orientation={Orientation.Column} className={styles.separator} />
);

const MODES = [
  { id: "inspect", data: { icon: IconName.Inspect, label: "Inspect" } },
  { id: "annotate", data: { icon: IconName.Pencil, label: "Annotate" } },
];

/**
 * The sample page's header: where the sample is, stepping between samples,
 * and the page's tools. A skeleton: back closes the sample, and the rest are
 * placeholders until their follow-ups land.
 */
export default function SamplePageHeader() {
  const close = useClearModal();
  const dataset = useProduct().useDatasetDisplayName();
  const { route } = useLocation<AppRoute>();
  const sample =
    route.kind === "sample"
      ? route.id
      : route.kind === "group"
        ? route.groupId
        : undefined;

  return (
    <header className={styles.header} data-cy="sample-page-header">
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Action icon={IconName.Menu} label="Sidebar" />
        <Action
          icon={IconName.ArrowLeft}
          label="Back to grid"
          onClick={close}
        />
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          {dataset}
        </Text>
        <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
          /
        </Text>
        <Text variant={TextVariant.Md} color={TextColor.Fg}>
          {sample}
        </Text>
        <Action icon={IconName.ChevronLeft} label="Previous sample" />
        <Action icon={IconName.ChevronRight} label="Next sample" />
      </Stack>
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Action icon={IconName.GridView} label="Group" />
        <Action icon={IconName.Tag} label="Tags" />
        <Action icon={IconName.Search} label="Search" />
        <Action icon={IconName.Puzzle} label="Plugins" />
        <Separator />
        <Action icon={IconName.History} label="History" />
        <Action icon={IconName.Notes} label="Comments" />
        <Action icon={IconName.ExternalLink} label="Copy link" />
        <RichButtonGroup buttons={MODES} exclusive className={styles.modes} />
        <Action icon={IconName.Sliders} label="Panel" />
        <Action icon={IconName.MoreHorizontal} label="More" />
      </Stack>
    </header>
  );
}
