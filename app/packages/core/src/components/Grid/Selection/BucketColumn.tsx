import {
  compactScopeLabel,
  countSelection,
  defaultSelectionBucketIcon,
  FOLD_STEP,
  foldWindow,
  SELECTION_BUCKET_ICONS,
  SELECTION_BUCKET_NAME_LENGTH,
  selectionBucketIcon,
  selectionBucketTitle,
  useFoldRevealed,
  type EpisodeSelection,
  type SelectionBucket,
  type SelectionBucketIcon,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  BackgroundColor,
  Button,
  CheckIcon,
  CloseIcon,
  Dropdown,
  DropdownAnchor,
  IconAction,
  Input,
  MenuTextItem,
  MoreHorizontalIcon,
  Pill,
  Popover,
  PopoverAnchor,
  Text,
  TextColor,
} from "@voxel51/voodo";
import { useState, type MouseEvent, type ReactNode } from "react";
import FoldCard from "./FoldCard";
import { isSectionDrag, readSectionDrag } from "./sectionDrag";
import SectionShape, { SECTION_SHAPES } from "./SectionShape";
import SelectionCards from "./SelectionCards";
import SelectionTooltip from "./SelectionTooltip";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

export interface BucketColumnProps {
  bucket: SelectionBucket;
  index: number;
  domainId: string;
  unit: SelectionUnit;
  captured: readonly EpisodeSelection[];
  multimodal?: boolean;
  /** Clicks land here, and the bar's actions apply here. */
  active: boolean;
  /** Shapes the other sections wear, which this one cannot take. */
  shapesTaken: readonly SelectionBucketIcon[];
  renderCard: (group: EpisodeSelection, bucketId: string) => ReactNode;
  onActivate: (bucketId: string) => void;
  onUpdate: (
    bucketId: string,
    patch: Pick<SelectionBucket, "name" | "icon">,
  ) => void;
  onClear: (bucketId: string) => void;
  /** Takes a card dropped here from another section; Alt copies it. */
  onReceive: (episodeId: string, from: string, copy: boolean) => void;
  /** Fold this section into the one before it; absent for the first. */
  onMergeBack?: () => void;
  /** Fold this section into the one after it; absent for the last. */
  onMergeForward?: () => void;
  onRemove: (bucketId: string) => void;
}

/** Clicks on a section's controls, and their portaled panels, stay theirs. */
const stop = (event: MouseEvent) => event.stopPropagation();

/** The shape a section wears, and the palette of shapes it can take instead. */
function ShapePicker({
  bucket,
  index,
  active,
  title,
  shapesTaken,
  onUpdate,
}: {
  bucket: SelectionBucket;
  index: number;
  active: boolean;
  title: string;
  shapesTaken: readonly SelectionBucketIcon[];
  onUpdate: BucketColumnProps["onUpdate"];
}) {
  const shape = selectionBucketIcon(bucket, index);
  return (
    <Popover
      anchor={PopoverAnchor.TopStart}
      trigger={
        <button
          type="button"
          className={styles.sectionShape}
          data-active={active || undefined}
          aria-label={`Change ${title} shape`}
          title="Change shape"
        >
          <SectionShape shape={shape} size={14} />
        </button>
      }
    >
      <div className={styles.shapePanel} style={trayTheme}>
        <Text variant="body-secondary" color="text-secondary">
          Section shape
        </Text>
        <div className={styles.shapePalette}>
          {SELECTION_BUCKET_ICONS.map((choice) => {
            const taken = shapesTaken.includes(choice);
            const label = SECTION_SHAPES[choice].label;
            return (
              <button
                key={choice}
                type="button"
                className={styles.shapeChoice}
                aria-pressed={shape === choice}
                aria-label={
                  taken ? `${label}, used by another section` : `Use ${label}`
                }
                title={taken ? "Used by another section" : label}
                disabled={taken}
                onClick={() =>
                  onUpdate(bucket.id, {
                    // The position's own shape is stored as no pick.
                    icon:
                      choice === defaultSelectionBucketIcon(index)
                        ? undefined
                        : choice,
                  })
                }
              >
                <SectionShape shape={choice} size={14} />
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
}

/** Renames a section in place; Enter saves and Escape cancels. */
function RenameField({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const name = draft.trim();
  return (
    <span className={styles.renameField} onClick={stop}>
      <Input
        size="sm"
        aria-label="Section name"
        maxLength={SELECTION_BUCKET_NAME_LENGTH}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && name) onSave(name);
          if (event.key === "Escape") onCancel();
        }}
      />
      <IconAction
        size="sm"
        icon={CheckIcon}
        aria-label="Save name"
        disabled={!name}
        onClick={() => onSave(name)}
      />
      <IconAction
        size="sm"
        icon={CloseIcon}
        aria-label="Cancel rename"
        onClick={onCancel}
      />
    </span>
  );
}

/**
 * One section of the split tray: its shape, name, and number key, a count
 * that clears it, its options, then its cards. Pressing the section makes
 * it active, so clicks land here and the bar's actions apply here; its
 * number key sorts the sample under the pointer into it, and a card dropped
 * on it moves here, or with Alt is copied. Double-clicking the name renames
 * it.
 */
export default function BucketColumn({
  bucket,
  index,
  domainId,
  unit,
  captured,
  multimodal,
  active,
  shapesTaken,
  renderCard,
  onActivate,
  onUpdate,
  onClear,
  onReceive,
  onMergeBack,
  onMergeForward,
  onRemove,
}: BucketColumnProps) {
  const [renaming, setRenaming] = useState(false);
  const [dropping, setDropping] = useState(false);
  const folding = useFoldRevealed(domainId, bucket.id);
  const fold = foldWindow(captured, folding.revealed);
  const reveal = Math.min(fold.hidden, 2 * FOLD_STEP);
  const title = selectionBucketTitle(bucket, index);
  const label = compactScopeLabel(countSelection(captured), unit);
  const count = captured.length;
  const key = index + 1;
  return (
    <section
      className={styles.column}
      data-bucket={bucket.id}
      data-active={active || undefined}
      data-dropping={dropping || undefined}
      aria-label={`${title}, ${label}${active ? ", active" : ""}`}
      onDragOver={(event) => {
        if (!isSectionDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = event.altKey ? "copy" : "move";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        // Passing over the section's own children is not leaving it
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const drag = readSectionDrag(event);
        if (!drag) return;
        event.preventDefault();
        if (drag.from !== bucket.id)
          onReceive(drag.episodeId, drag.from, event.altKey);
      }}
      onClick={(event) => {
        // Cards and controls keep their own clicks.
        if (
          (event.target as HTMLElement).closest(
            "[data-episode-id], button, input, a",
          )
        )
          return;
        onActivate(bucket.id);
      }}
    >
      <header className={styles.columnHeader}>
        <span onClick={stop}>
          <ShapePicker
            bucket={bucket}
            index={index}
            active={active}
            title={title}
            shapesTaken={shapesTaken}
            onUpdate={onUpdate}
          />
        </span>
        {renaming ? (
          <RenameField
            initial={title}
            onSave={(name) => {
              onUpdate(bucket.id, { name });
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className={styles.columnName}
              aria-pressed={active}
              title="Double-click to rename"
              onClick={() => onActivate(bucket.id)}
              onDoubleClick={() => setRenaming(true)}
            >
              <Text
                variant="body-secondary"
                color={active ? TextColor.Primary : TextColor.Secondary}
              >
                {title}
              </Text>
            </button>
            <SelectionTooltip
              wrapperClassName={styles.tipWrap}
              content={
                <Text variant="body-tertiary">
                  {`Point at a ${unit.one} and press ${key} to sort it here`}
                </Text>
              }
            >
              <kbd className={styles.sectionKey}>{key}</kbd>
            </SelectionTooltip>
          </>
        )}
        <span className={styles.columnEnd} onClick={stop}>
          {count > 0 && (
            <Pill
              size="sm"
              backgroundColor={BackgroundColor.CardElevated}
              color="text-secondary"
              className={styles.sectionCount}
            >
              <span className={styles.countPillBody}>
                <Text
                  variant="body-secondary"
                  color="text-primary"
                  className={styles.countPillCount}
                >
                  {count.toLocaleString()}
                </Text>
                <Button
                  size="xs"
                  variant="icon"
                  leadingIcon={CloseIcon}
                  aria-label={`Clear ${count.toLocaleString()} from ${title}`}
                  onClick={() => onClear(bucket.id)}
                />
              </span>
            </Pill>
          )}
          <Dropdown
            anchor={DropdownAnchor.TopEnd}
            trigger={
              <IconAction
                size="sm"
                icon={MoreHorizontalIcon}
                aria-label={`${title} options`}
              />
            }
          >
            <MenuTextItem onClick={() => setRenaming(true)}>
              Rename
            </MenuTextItem>
            {onMergeBack && (
              <MenuTextItem onClick={onMergeBack}>Merge back</MenuTextItem>
            )}
            {onMergeForward && (
              <MenuTextItem onClick={onMergeForward}>
                Merge forward
              </MenuTextItem>
            )}
            <MenuTextItem onClick={() => onRemove(bucket.id)}>
              Remove section
            </MenuTextItem>
          </Dropdown>
        </span>
      </header>
      <SelectionCards
        className={styles.columnCards}
        label={`Selected ${unit.many} in ${title}`}
        multimodal={multimodal}
      >
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
      </SelectionCards>
    </section>
  );
}
