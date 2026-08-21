import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useSetAtom } from "jotai";
import React, { useMemo } from "react";
import { useSceneInventory } from "../../../../scene-inventory/react";
import {
  selectedObjectAtom,
  useSelectedObject,
  type SelectedImageObject,
  type SelectedSceneObject,
} from "../../interaction/selection/selected-object";
import settingsStyles from "../../tiles/Tile.settings.module.css";

/**
 * Right-sidebar inspector for the episode modal. Follows the modal-wide
 * object selection (`selectedObjectAtom`) rather than the focused
 * tile, so clicking an object in ANY tile shows its payload here.
 * Structured fields for the known selection kinds, raw JSON below for
 * everything the fields don't cover.
 */
const InspectorSidebar: React.FC = () => {
  const selected = useSelectedObject();
  const setSelected = useSetAtom(selectedObjectAtom);
  const sources = useSceneInventory();
  const sourceNamesById = useMemo(
    () => new Map(sources.map((source) => [source.id, source.sourceName])),
    [sources],
  );
  const selectedSourceName = selected
    ? (sourceNamesById.get(selected.stream) ?? "Unknown source")
    : "Unknown source";

  return (
    <>
      {selected === null ? (
        <span
          className={settingsStyles.emptyText}
          data-testid="episode-inspector-empty"
        >
          Click an object in a tile — a 3D box or an image annotation — to
          inspect it. Esc clears the selection.
        </span>
      ) : (
        <div
          className={`${settingsStyles.root} ${settingsStyles.inspectorBody}`}
          data-testid="episode-inspector-body"
        >
          {selected.kind === "scene-annotation" ? (
            <SceneObjectFields
              selected={selected}
              sourceName={selectedSourceName}
            />
          ) : (
            <ImageObjectFields
              selected={selected}
              sourceName={selectedSourceName}
            />
          )}
          <Button
            variant={Variant.Secondary}
            size={Size.Xs}
            data-testid="episode-inspector-clear"
            onClick={() => setSelected(null)}
          >
            Clear selection
          </Button>
        </div>
      )}
    </>
  );
};

function SceneObjectFields({
  selected,
  sourceName,
}: {
  readonly selected: SelectedSceneObject;
  readonly sourceName: string;
}) {
  const metadataEntries = Object.entries(selected.metadata);
  return (
    <>
      <Field label="Object" value={selected.label ?? selected.entityId} />
      <Field label="Entity id" value={selected.entityId} />
      <Field label="Stream" value={sourceName} />
      {selected.frameId ? (
        <Field label="Frame" value={selected.frameId} />
      ) : null}
      <div className={settingsStyles.field}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Metadata
        </Text>
        {metadataEntries.length > 0 ? (
          <div className={settingsStyles.optionStack}>
            {metadataEntries.map(([key, value]) => (
              <span className={settingsStyles.metaText} key={key}>
                {key}: {value}
              </span>
            ))}
          </div>
        ) : (
          <span className={settingsStyles.emptyText}>No metadata</span>
        )}
      </div>
    </>
  );
}

function ImageObjectFields({
  selected,
  sourceName,
}: {
  readonly selected: SelectedImageObject;
  readonly sourceName: string;
}) {
  return (
    <>
      <Field label="Object" value={selected.label ?? selected.primitiveKind} />
      <Field label="Kind" value={selected.primitiveKind} />
      <Field label="Stream" value={sourceName} />
      <div className={`${settingsStyles.field} ${settingsStyles.growField}`}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Geometry
        </Text>
        <pre className={`${settingsStyles.metaText} ${settingsStyles.growPre}`}>
          {safeJson(selected.data)}
        </pre>
      </div>
    </>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={settingsStyles.field}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {label}
      </Text>
      <Text variant={TextVariant.Xs} color={TextColor.Primary}>
        {value}
      </Text>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

export default InspectorSidebar;
