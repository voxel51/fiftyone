import {
  compactScopeLabel,
  countSelection,
  FOLD_STEP,
  foldWindow,
  SELECTION_BUCKET_ICONS,
  SELECTION_BUCKET_NAME_LENGTH,
  selectionBucketGesture,
  selectionBucketTitle,
  useFoldRevealed,
  type EpisodeSelection,
  type SelectionBucket,
  type SelectionBucketIcon,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Anchor,
  Button,
  ClearAllIcon,
  DeleteOutlineIcon,
  Dropdown,
  DropdownAnchor,
  EditIcon,
  HighlightAltIcon,
  Input,
  MenuIconTextItem,
  MenuSeparator,
  MoreHorizontalIcon,
  Popover,
  PopoverAnchor,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useState, type ReactNode } from "react";
import BucketAvatar, { BUCKET_ICONS } from "./BucketAvatar";
import { gestureLabel } from "./bucketGestures";
import FoldCard from "./FoldCard";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

export interface BucketColumnProps {
  bucket: SelectionBucket;
  index: number;
  domainId: string;
  unit: SelectionUnit;
  captured: readonly EpisodeSelection[];
  /** Actions in the bar apply to this bucket. */
  target: boolean;
  /** A held modifier would send the next click here. */
  armed: boolean;
  /** Whether the layout still allows dropping this bucket. */
  removable: boolean;
  renderCard: (group: EpisodeSelection, bucketId: string) => ReactNode;
  onTarget: (bucketId: string) => void;
  onUpdate: (
    bucketId: string,
    patch: Pick<SelectionBucket, "name" | "icon">,
  ) => void;
  onClear: (bucketId: string) => void;
  onRemove: (bucketId: string) => void;
}

/** The name field keeps what is typed, including a trailing space the stored name trims. */
function NameField({
  bucket,
  onUpdate,
}: {
  bucket: SelectionBucket;
  onUpdate: BucketColumnProps["onUpdate"];
}) {
  const [draft, setDraft] = useState(bucket.name ?? "");
  return (
    <Input
      size={Size.Sm}
      aria-label="Bucket name"
      placeholder={`Name (up to ${SELECTION_BUCKET_NAME_LENGTH} characters)`}
      maxLength={SELECTION_BUCKET_NAME_LENGTH}
      autoFocus
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onUpdate(bucket.id, { name: event.target.value });
      }}
    />
  );
}

/** Name and icon, applied as they change; the popover closes on Done or Escape. */
function BucketEditor({
  bucket,
  index,
  open,
  onOpenChange,
  onUpdate,
  trigger,
}: {
  bucket: SelectionBucket;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: BucketColumnProps["onUpdate"];
  trigger: ReactNode;
}) {
  const iconId = `bucket-icon-${bucket.id}`;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      anchor={PopoverAnchor.TopStart}
      trigger={trigger}
    >
      {({ close }) => (
        <div
          className={`${styles.panel} ${styles.bucketEditor}`}
          style={trayTheme}
          data-bucket-editor={bucket.id}
        >
          <Text
            variant={TextVariant.Label}
            color={TextColor.Secondary}
            className={styles.sheetTitle}
          >
            {`Bucket ${index + 1} · ${gestureLabel(selectionBucketGesture(index))}`}
          </Text>
          <NameField bucket={bucket} onUpdate={onUpdate} />
          <div>
            <Text
              id={iconId}
              variant={TextVariant.Xs}
              color={TextColor.Secondary}
            >
              Icon
            </Text>
            <div
              role="radiogroup"
              aria-labelledby={iconId}
              className={styles.iconPalette}
            >
              <button
                type="button"
                role="radio"
                aria-checked={!bucket.icon}
                aria-label="No icon"
                className={styles.iconChoice}
                onClick={() => onUpdate(bucket.id, { icon: undefined })}
              >
                <BucketAvatar bucket={{ id: bucket.id }} index={index} />
              </button>
              {SELECTION_BUCKET_ICONS.map((icon: SelectionBucketIcon) => (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={bucket.icon === icon}
                  aria-label={BUCKET_ICONS[icon].label}
                  title={BUCKET_ICONS[icon].label}
                  className={styles.iconChoice}
                  onClick={() => onUpdate(bucket.id, { icon })}
                >
                  <BucketAvatar
                    bucket={{ id: bucket.id, icon }}
                    index={index}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className={styles.panelActions}>
            <Button size={Size.Sm} variant={Variant.Secondary} onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/**
 * One bucket's column in the strip: a header naming the bucket, its count,
 * and the gesture that feeds it, then its cards. Pressing the header makes
 * the bucket the target of the bar's actions; a double press edits it.
 */
export default function BucketColumn({
  bucket,
  index,
  domainId,
  unit,
  captured,
  target,
  armed,
  removable,
  renderCard,
  onTarget,
  onUpdate,
  onClear,
  onRemove,
}: BucketColumnProps) {
  const [editing, setEditing] = useState(false);
  const folding = useFoldRevealed(domainId, bucket.id);
  const fold = foldWindow(captured, folding.revealed);
  const reveal = Math.min(fold.hidden, 2 * FOLD_STEP);
  const title = selectionBucketTitle(bucket, index);
  const gesture = gestureLabel(selectionBucketGesture(index));
  const counts = countSelection(captured);
  const label = compactScopeLabel(counts, unit);
  const count = captured.length;
  const header = (
    <button
      type="button"
      className={styles.columnTitle}
      aria-pressed={target}
      aria-label={`${title}, ${label}. Actions apply to this bucket when pressed.`}
      title={
        target
          ? "Actions apply to this bucket"
          : "Press to apply actions to this bucket. Double-click to rename."
      }
      onClick={() => onTarget(bucket.id)}
      onDoubleClick={() => setEditing(true)}
    >
      <BucketAvatar bucket={bucket} index={index} />
      <Text variant={TextVariant.Sm} className={styles.columnName}>
        {title}
      </Text>
      {/* Re-keyed on change so the count bumps when a tile lands here. */}
      <span key={count} className={styles.columnCount}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {count.toLocaleString()}
        </Text>
      </span>
    </button>
  );
  return (
    <section
      className={styles.column}
      data-bucket={bucket.id}
      data-target={target || undefined}
      data-armed={armed || undefined}
      aria-label={`${title}, ${label}`}
    >
      <header className={styles.columnHeader}>
        <BucketEditor
          bucket={bucket}
          index={index}
          open={editing}
          onOpenChange={setEditing}
          onUpdate={onUpdate}
          trigger={header}
        />
        <Tooltip
          anchor={Anchor.Top}
          wrapperClassName={styles.tipWrap}
          content={
            <Text variant={TextVariant.Sm}>
              {index === 0
                ? `Select tiles as usual to add ${unit.many} here`
                : `${gesture} a tile to add it here`}
            </Text>
          }
        >
          <kbd className={styles.gestureKey}>{gesture}</kbd>
        </Tooltip>
        <Dropdown
          anchor={DropdownAnchor.BottomEnd}
          trigger={
            <Button
              size={Size.Xs}
              variant={Variant.Icon}
              leadingIcon={MoreHorizontalIcon}
              aria-label={`${title} options`}
            />
          }
        >
          <MenuIconTextItem
            icon={<HighlightAltIcon size={Size.Sm} />}
            text="Apply actions to this bucket"
            disabled={target}
            onClick={() => onTarget(bucket.id)}
          />
          <MenuIconTextItem
            icon={<EditIcon size={Size.Sm} />}
            text="Rename or change icon"
            onClick={() => setEditing(true)}
          />
          <MenuSeparator />
          <MenuIconTextItem
            icon={<ClearAllIcon size={Size.Sm} />}
            text="Clear bucket"
            subtext={count ? label : undefined}
            disabled={!count}
            onClick={() => onClear(bucket.id)}
          />
          <MenuIconTextItem
            icon={<DeleteOutlineIcon size={Size.Sm} />}
            text="Remove bucket"
            subtext={count ? `Clears ${label}` : undefined}
            destructive
            disabled={!removable}
            onClick={() => onRemove(bucket.id)}
          />
        </Dropdown>
      </header>
      <div
        role="group"
        className={styles.columnCards}
        aria-label={`Selected ${unit.many} in ${title}`}
      >
        {count === 0 ? (
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Secondary}
            className={styles.columnEmpty}
          >
            {index === 0
              ? `Select tiles to add ${unit.many} here`
              : `${gesture} tiles to add ${unit.many} here`}
          </Text>
        ) : (
          <>
            {fold.head.map((group) => renderCard(group, bucket.id))}
            {fold.hidden > 0 && (
              <FoldCard
                hidden={fold.hidden}
                reveal={reveal}
                unit={unit}
                onReveal={() => folding.reveal(FOLD_STEP)}
              />
            )}
            {fold.tail.map((group) => renderCard(group, bucket.id))}
          </>
        )}
      </div>
    </section>
  );
}
