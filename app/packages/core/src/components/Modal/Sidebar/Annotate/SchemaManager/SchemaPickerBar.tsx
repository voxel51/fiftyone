/**
 * The overview header's left side: the schema picker and its actions
 * menu, or, while naming / confirming a delete, the inline name input
 * or the delete confirmation.
 */

import {
  AddIcon,
  Button,
  ContentCopyIcon,
  cssVar,
  DeleteIcon,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  EditIcon,
  Icon,
  IconName,
  Input,
  MenuCheckItem,
  MenuIconTextItem,
  Size,
  Text,
  Variant,
} from "@voxel51/voodo";
import styled from "styled-components";
import type { SchemaDocSummary } from "./useSchemaDocs";

const DEFAULT_SCHEMA_LABEL = "Default schema (all fields)";

// A plain pick list (voodo's Select is a typeahead combobox): the trigger
// shows the selected schema, the menu checks it, like the sidebar's schema
// lens.
const PickerTrigger = styled(DropdownTrigger)`
  && {
    width: 260px;
  }

  /* voodo centers the label and the caret together: span the button so
     the label takes the free space and the caret sits at the far right */
  && > div {
    width: 100%;
    min-width: 0;
    justify-content: space-between;
  }
`;

const PickerLabel = styled.span`
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PickerItem = styled(MenuCheckItem)`
  flex-direction: row-reverse;
  justify-content: space-between;

  &[aria-checked="true"] {
    background-color: ${cssVar.color.bg.selected};
  }

  &[aria-checked="true"] svg {
    color: ${cssVar.color.brand.primary};
  }
`;

export type NamingMode = null | "create" | "rename" | "delete";

export interface SchemaPickerBarProps {
  naming: NamingMode;
  nameValue: string;
  /** The selected doc's name (delete confirmation, rename default). */
  docName: string | undefined;
  docMode: boolean;
  docsAvailable: boolean;
  docs: SchemaDocSummary[];
  selectedId: string | null;
  setNameValue: (value: string) => void;
  setNaming: (mode: NamingMode) => void;
  submitName: () => void;
  cancelNaming: () => void;
  selectSchema: (id: string) => void;
  duplicateSchema: () => void;
  deleteSchema: () => void;
}

const SchemaPickerBar = ({
  naming,
  nameValue,
  docName,
  docMode,
  docsAvailable,
  docs,
  selectedId,
  setNameValue,
  setNaming,
  submitName,
  cancelNaming,
  selectSchema,
  duplicateSchema,
  deleteSchema,
}: SchemaPickerBarProps) => {
  const selectedLabel =
    (selectedId && docs.find((d) => d.id === selectedId)?.name) ||
    DEFAULT_SCHEMA_LABEL;

  return (
    <>
      {naming === "delete" ? (
        // Deleting is one click away in the menu and has no undo; stages
        // referencing the doc fall back to the default schema.
        <>
          <Text data-cy="schema-delete-confirm">
            Delete schema &ldquo;{docName}&rdquo;? Workflow stages that
            reference it fall back to the default schema.
          </Text>
          <Button
            size={Size.Sm}
            variant={Variant.Danger}
            data-cy="schema-delete-confirm-button"
            onClick={() => deleteSchema()}
          >
            Delete
          </Button>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={cancelNaming}
          >
            Cancel
          </Button>
        </>
      ) : naming ? (
        <>
          <Input
            size={Size.Sm}
            autoFocus
            data-cy="schema-name-input"
            placeholder={
              naming === "create" ? "New schema name…" : "Rename schema…"
            }
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") cancelNaming();
            }}
            style={{ minWidth: 220 }}
          />
          <Button size={Size.Sm} variant={Variant.Primary} onClick={submitName}>
            Save
          </Button>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={cancelNaming}
          >
            Cancel
          </Button>
        </>
      ) : docsAvailable ? (
        <>
          <Dropdown
            portal
            anchor={DropdownAnchor.BottomStart}
            trigger={
              <PickerTrigger
                data-cy="schema-select"
                aria-label="Schema"
                title={selectedLabel}
              >
                <PickerLabel>{selectedLabel}</PickerLabel>
              </PickerTrigger>
            }
          >
            <PickerItem
              data-cy="schema-option-default"
              checked={!selectedId}
              onClick={() => selectSchema("")}
            >
              {DEFAULT_SCHEMA_LABEL}
            </PickerItem>
            {docs.map((d) => (
              <PickerItem
                key={d.id}
                data-cy="schema-option"
                checked={selectedId === d.id}
                title={d.name}
                onClick={() => selectSchema(d.id)}
              >
                {d.name}
              </PickerItem>
            ))}
          </Dropdown>
          <Dropdown
            anchor={DropdownAnchor.BottomEnd}
            trigger={
              <Button
                variant={Variant.Icon}
                borderless
                aria-label="Schema actions"
                data-cy="schema-actions-menu"
              >
                <Icon name={IconName.MoreHorizontal} size={Size.Md} />
              </Button>
            }
          >
            <MenuIconTextItem
              data-cy="schema-action-new"
              icon={<AddIcon size={Size.Sm} />}
              text="New schema"
              onClick={() => {
                setNameValue("");
                setNaming("create");
              }}
            />
            {docMode ? (
              <MenuIconTextItem
                data-cy="schema-action-rename"
                icon={<EditIcon size={Size.Sm} />}
                text="Rename"
                onClick={() => {
                  setNameValue(docName ?? "");
                  setNaming("rename");
                }}
              />
            ) : null}
            <MenuIconTextItem
              data-cy="schema-action-duplicate"
              icon={<ContentCopyIcon size={Size.Sm} />}
              text="Duplicate"
              onClick={() => duplicateSchema()}
            />
            {docMode ? (
              <MenuIconTextItem
                data-cy="schema-action-delete"
                icon={<DeleteIcon size={Size.Sm} />}
                text="Delete schema"
                destructive
                onClick={() => setNaming("delete")}
              />
            ) : null}
          </Dropdown>
        </>
      ) : null}
    </>
  );
};

export default SchemaPickerBar;
