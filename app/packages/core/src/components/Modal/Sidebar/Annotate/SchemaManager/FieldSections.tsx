/**
 * The overview body: the Active fields section (set-up fields, then
 * everything else) and the collapsible Hidden fields section, each
 * with its select-all checkbox in custom-schema mode.
 */

import type { ListItemProps } from "@voxel51/voodo";
import {
  Anchor,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import type { MouseEvent } from "react";
import type { OverviewStyles } from "./overviewStyles";
import SelectAllCheckbox from "./SelectAllCheckbox";
import { CollapsibleHeader, GUISectionHeader, SelectableList } from "./styled";

const SectionTitle = ({ children }: { children: string }) => (
  <Text
    variant={TextVariant.Lg}
    style={{ fontWeight: 500 }}
    color={TextColor.Secondary}
  >
    {children}
  </Text>
);

const InfoTip = ({ text }: { text: string }) => (
  <Tooltip content={<Text>{text}</Text>} anchor={Anchor.Top} portal>
    <Icon name={IconName.Info} size={Size.Md} />
  </Tooltip>
);

type Item = { id: string; data: ListItemProps & { canSelect?: boolean } };

export interface FieldSectionsProps {
  docMode: boolean;
  styles: OverviewStyles;
  scannedItems: Item[];
  restItems: Item[];
  hiddenItems: Item[];
  activeCount: number;
  hiddenCount: number;
  canReorder: boolean;
  handleOrderChange: (items: { id: string; data: ListItemProps }[]) => void;
  selectedActive: Set<string>;
  selectedHidden: Set<string>;
  selectedActiveList: string[];
  selectedHiddenList: string[];
  setActiveSelection: (ids: string[]) => void;
  setHiddenSelection: (ids: string[]) => void;
  onActiveSelected: (ids: string[]) => void;
  onHiddenSelected: (ids: string[]) => void;
  activeRange: { onMouseDownCapture: (e: MouseEvent) => void };
  hiddenRange: { onMouseDownCapture: (e: MouseEvent) => void };
  hiddenExpanded: boolean;
  setHiddenExpanded: (update: (value: boolean) => boolean) => void;
}

const FieldSections = ({
  docMode,
  styles,
  scannedItems,
  restItems,
  hiddenItems,
  activeCount,
  hiddenCount,
  canReorder,
  handleOrderChange,
  selectedActive,
  selectedHidden,
  selectedActiveList,
  selectedHiddenList,
  setActiveSelection,
  setHiddenSelection,
  onActiveSelected,
  onHiddenSelected,
  activeRange,
  hiddenRange,
  hiddenExpanded,
  setHiddenExpanded,
}: FieldSectionsProps) => {
  return (
    <>
      <GUISectionHeader>
        {docMode ? (
          <SelectAllCheckbox
            ids={[...scannedItems, ...restItems]
              .filter((i) => i.data.canSelect)
              .map((i) => i.id)}
            selected={selectedActive}
            onChange={setActiveSelection}
            label="Select all active fields"
            data-cy="select-all-active-fields"
          />
        ) : null}
        <SectionTitle>Active fields</SectionTitle>
        <InfoTip text="Fields available in the Explore and Annotate sidebars. Set-up fields are annotatable; unscanned fields are explore-only until you set them up." />
        <Pill size={Size.Md}>{activeCount}</Pill>
      </GUISectionHeader>
      {activeCount ? (
        <div onMouseDownCapture={activeRange.onMouseDownCapture}>
          {scannedItems.length ? (
            <SelectableList>
              <RichList
                data-cy="active-fields"
                listItems={scannedItems}
                draggable={canReorder}
                onOrderChange={handleOrderChange}
                onSelected={onActiveSelected}
                selected={selectedActiveList}
              />
            </SelectableList>
          ) : null}
          {restItems.length ? (
            // Same spacing between the two lists as between
            // their rows, so the section reads as one list.
            <SelectableList
              style={{
                marginTop: scannedItems.length ? "1rem" : 0,
              }}
            >
              <RichList
                data-cy="inactive-fields"
                listItems={restItems}
                draggable={false}
                onSelected={onActiveSelected}
                selected={selectedActiveList}
              />
            </SelectableList>
          ) : null}
        </div>
      ) : (
        <div style={styles.emptyText}>No active fields.</div>
      )}

      <>
        <GUISectionHeader>
          {docMode ? (
            <SelectAllCheckbox
              ids={hiddenItems.filter((i) => i.data.canSelect).map((i) => i.id)}
              selected={selectedHidden}
              onChange={setHiddenSelection}
              label="Select all hidden fields"
              data-cy="select-all-hidden-fields"
            />
          ) : null}
          <CollapsibleHeader
            onClick={() => setHiddenExpanded((v) => !v)}
            style={{ padding: 0, flex: "none" }}
            data-cy="schema-group-Hidden"
          >
            <SectionTitle>Hidden fields</SectionTitle>
            <Icon
              name={
                hiddenExpanded ? IconName.ChevronTop : IconName.ChevronBottom
              }
              size={Size.Md}
            />
          </CollapsibleHeader>
          <InfoTip text="Hidden fields never reach anyone viewing through this schema — not the grid, the sidebars, or the sample data." />
          <Pill size={Size.Md}>{hiddenCount}</Pill>
        </GUISectionHeader>
        {hiddenExpanded ? (
          hiddenItems.length ? (
            <SelectableList onMouseDownCapture={hiddenRange.onMouseDownCapture}>
              <RichList
                data-cy="hidden-fields"
                listItems={hiddenItems}
                draggable={false}
                onSelected={onHiddenSelected}
                selected={selectedHiddenList}
              />
            </SelectableList>
          ) : (
            <div style={styles.emptyText}>
              {docMode
                ? "No hidden fields. Select active fields and move them here to hide them in this schema."
                : "The default schema shows every field. To hide fields, create a custom schema and edit it there."}
            </div>
          )
        ) : null}
      </>
    </>
  );
};

export default FieldSections;
