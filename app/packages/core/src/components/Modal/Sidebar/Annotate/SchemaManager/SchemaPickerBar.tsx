/**
 * The overview header's left side: the schema picker and its actions
 * menu, or, while naming / confirming a delete, the inline name input
 * or the delete confirmation.
 */

import {
  AddIcon,
  Button,
  ContentCopyIcon,
  DeleteIcon,
  Dropdown,
  DropdownAnchor,
  EditIcon,
  Icon,
  IconName,
  Input,
  MenuIconTextItem,
  Select,
  Size,
  Text,
  Variant,
} from "@voxel51/voodo";
import { useSchemaShownSignal } from "./e2eSignals";
import type { SchemaDocSummary } from "./useSchemaDocs";

// voodo's Select shows nothing for an empty id; the dataset default
// rides this sentinel and maps back to "no doc".
const DEFAULT_SCHEMA_OPTION = "__default__";

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
  useSchemaShownSignal(naming === null ? (docName ?? null) : undefined);

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
          <Select
            exclusive
            portal
            data-cy="schema-select"
            aria-label="Schema"
            value={selectedId ?? DEFAULT_SCHEMA_OPTION}
            options={[
              {
                id: DEFAULT_SCHEMA_OPTION,
                data: { label: "Default schema (all fields)" },
              },
              ...docs.map((d) => ({ id: d.id, data: { label: d.name } })),
            ]}
            onChange={(id) => {
              if (typeof id === "string") {
                selectSchema(id === DEFAULT_SCHEMA_OPTION ? "" : id);
              }
            }}
            style={{ width: 260 }}
          />
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
