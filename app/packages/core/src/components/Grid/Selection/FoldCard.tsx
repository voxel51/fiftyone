import type { SelectionUnit } from "@fiftyone/state/src/selection";
import {
  MoreHorizontalIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { plural } from "./format";
import styles from "./SelectionTray.module.css";

/**
 * Stands in for the middle of a long selection between its first and last
 * cards. Each press reveals a chunk from both ends; the exact total lives in
 * the summary sentence, so this only has to say what is hidden.
 */
export default function FoldCard({
  hidden,
  reveal,
  unit,
  onReveal,
}: {
  hidden: number;
  /** How many more cards the next press shows. */
  reveal: number;
  unit: SelectionUnit;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.fold}
      data-tray-fold=""
      aria-label={`Show ${reveal} more of ${plural(
        hidden,
        `hidden ${unit.one}`,
        `hidden ${unit.many}`,
      )}`}
      onClick={onReveal}
    >
      <MoreHorizontalIcon size={Size.Md} color={TextColor.Secondary} />
      <Text variant={TextVariant.Sm}>{`${hidden.toLocaleString()} more`}</Text>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        not shown
      </Text>
      <Text
        variant={TextVariant.Xs}
        color={TextColor.Accent}
        className={styles.foldAction}
      >
        {`Show ${reveal} more`}
      </Text>
    </button>
  );
}
