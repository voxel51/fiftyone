import {
  selectionBucketTitle,
  type SelectionBucket,
  type SelectionBucketIcon,
} from "@fiftyone/state/src/selection";
import {
  AutoAwesomeIcon,
  BookmarkIcon,
  CancelIcon,
  CheckCircleIcon,
  LightbulbIcon,
  PinIcon,
  QuestionMarkIcon,
  RemoveCircleOutlineIcon,
  Size,
  type IconInput,
} from "@voxel51/voodo";
import styles from "./SelectionTray.module.css";

/** A per-icon VOODO component; the legacy name form is never used here. */
type IconComponent = Exclude<IconInput, string>;

/**
 * The icons a bucket can wear, mapped onto what VOODO ships: approval and
 * rejection stand in for thumbs, a sparkle for a star, a pin for a flag.
 */
export const BUCKET_ICONS: Record<
  SelectionBucketIcon,
  { readonly Icon: IconComponent; readonly label: string }
> = {
  approve: { Icon: CheckCircleIcon, label: "Approve" },
  reject: { Icon: CancelIcon, label: "Reject" },
  neutral: { Icon: RemoveCircleOutlineIcon, label: "Neutral" },
  question: { Icon: QuestionMarkIcon, label: "Question" },
  star: { Icon: AutoAwesomeIcon, label: "Star" },
  flag: { Icon: PinIcon, label: "Flag" },
  bookmark: { Icon: BookmarkIcon, label: "Bookmark" },
  idea: { Icon: LightbulbIcon, label: "Idea" },
};

/**
 * A bucket's mark: its icon, or its position number when it has none. Sized
 * for a pill (`sm`) or a tile chip (`xs`). Decorative; the surrounding
 * control carries the bucket's name.
 */
export default function BucketAvatar({
  bucket,
  index,
  size = "sm",
}: {
  bucket: SelectionBucket;
  index: number;
  size?: "xs" | "sm";
}) {
  const entry = bucket.icon ? BUCKET_ICONS[bucket.icon] : null;
  return (
    <span
      className={styles.bucketAvatar}
      data-size={size}
      data-icon={bucket.icon ?? undefined}
      aria-hidden="true"
      title={selectionBucketTitle(bucket, index)}
    >
      {entry ? (
        <entry.Icon size={size === "xs" ? Size.Xs : Size.Sm} />
      ) : (
        index + 1
      )}
    </span>
  );
}
