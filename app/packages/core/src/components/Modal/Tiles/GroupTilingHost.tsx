import * as fos from "@fiftyone/state";
import {
  MosaicGrid,
  TilingHeader,
  TilingProvider,
  TilingZeroState,
  useTileRegistry,
  useTiling,
} from "@fiftyone/tiling";
import { useCallback, useEffect, useMemo } from "react";
import EnsureGroupSample from "../Group/EnsureGroupSample";
import { GroupAddTileMenu } from "./GroupAddTileMenu";
import { GroupLayoutPersistence } from "./GroupLayoutPersistence";
import { main, root } from "./GroupTilingHost.module.css";
import { GroupVisibilityBridge } from "./GroupVisibilityBridge";
import {
  registeredGroupTiles,
  type GroupTileFacts,
} from "./group-tile-catalog";
import { useGroupSampleLayout } from "./use-group-sample-layout";
import { useGroupTileFacts } from "./use-group-tile-facts";

/**
 * The group sample view on the tiling system: header with the Layout menu,
 * mosaic of built-in group content (carousel, media, 3D) or, for dynamic
 * groups, the existing paginated tree as one tile. No timeline: group
 * elements are switched with the paginator, not scrubbed.
 */
export const GroupTilingHost = () => {
  const facts = useGroupTileFacts();
  const datasetId = fos.useCurrentDatasetId();
  const datasetName = fos.useCurrentDatasetName();
  const resolved = useGroupSampleLayout(facts, datasetId);

  return (
    <div className={root} data-cy="group-container">
      <TilingProvider
        key={datasetId ?? "dataset"}
        initialTiles={resolved.initialTiles}
        initialLayout={resolved.initialLayout}
        initialExpandedTileId={resolved.initialExpandedTileId}
        resetTiles={resolved.resetTiles}
        resetLayout={resolved.resetLayout}
      >
        <RegisterGroupTiles facts={facts} />
        {datasetId && <GroupLayoutPersistence datasetId={datasetId} />}
        {!facts.dynamic && <GroupVisibilityBridge />}
        <EnsureGroupSample>
          <GroupTilesLayout
            fileName={datasetName ?? ""}
            showSlice={!facts.dynamic}
          />
        </EnsureGroupSample>
      </TilingProvider>
    </div>
  );
};

/** Keeps the registry in step with what this dataset offers. */
const RegisterGroupTiles = ({ facts }: { facts: GroupTileFacts }) => {
  const { registerTile } = useTileRegistry();
  const entries = useMemo(() => registeredGroupTiles(facts), [facts]);

  useEffect(() => {
    const disposers = entries.map((entry) => registerTile(entry));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [entries, registerTile]);

  return null;
};

/** Active slice label for the header caption; never suspends the header. */
const GroupSliceCaption = () => {
  const label = fos.useActiveSliceDescriptorLabel();
  if (!label) return null;
  return <span data-cy="group-active-slice">{label}</span>;
};

const GroupTilesLayout = ({
  fileName,
  showSlice,
}: {
  fileName: string;
  showSlice: boolean;
}) => {
  const {
    layout,
    tiles,
    focusedTileId,
    setLayout,
    setFocusedTileId,
    changeTileType,
    closeOtherTiles,
    expandedTileId,
    setExpandedTileId,
    setLayoutMetrics,
  } = useTiling();

  const handleFocusTile = useCallback(
    (id: string, reason: "select" | "action") => {
      setFocusedTileId(reason === "select" && focusedTileId === id ? null : id);
    },
    [focusedTileId, setFocusedTileId],
  );

  // Built-in kinds are singletons: refuse a change to a kind already shown.
  const handleChangeTileType = useCallback(
    (id: string, type: string) => {
      const present = Object.entries(tiles).some(
        ([tileId, tile]) => tileId !== id && tile.type === type,
      );
      if (!present) changeTileType(id, type);
    },
    [changeTileType, tiles],
  );

  const addTileMenu = <GroupAddTileMenu />;

  return (
    <>
      <TilingHeader
        fileName={fileName}
        headerCaption={showSlice ? <GroupSliceCaption /> : undefined}
        addTileMenu={addTileMenu}
      />
      <div className={main}>
        <MosaicGrid
          tiles={tiles}
          value={layout}
          onChange={setLayout}
          focusedTileId={focusedTileId}
          onFocusTile={handleFocusTile}
          onChangeTileType={handleChangeTileType}
          onCloseOtherTiles={closeOtherTiles}
          expandedTileId={expandedTileId}
          onExpandedTileIdChange={setExpandedTileId}
          onLayoutMetricsChange={setLayoutMetrics}
          zeroStateView={<TilingZeroState addTileMenu={addTileMenu} />}
        />
      </div>
    </>
  );
};

export default GroupTilingHost;
