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
import {
  DynamicGroupPaginator,
  useShowsDynamicGroupPaginator,
} from "./DynamicGroupPaginator";
import { GroupAddTileMenu } from "./GroupAddTileMenu";
import { GroupLayoutPersistence } from "./GroupLayoutPersistence";
import { GroupVisibilityBridge } from "./GroupVisibilityBridge";
import {
  registeredGroupTiles,
  type GroupTileFacts,
} from "./group-tile-catalog";
import { SampleTilesHostContext } from "./host-context";
import { LEGACY_SAMPLE_PANELS_STORAGE_KEY } from "./layout-persistence";
import {
  useRegisteredPanelTiles,
  useSingletonPanelTileTypes,
} from "./panel-tiles";
import { SampleViewPanelsControllerBinding } from "./SampleViewPanelsControllerBinding";
import { footerHost, main, root } from "./SampleTilingHost.module.css";
import { GROUP_TILE_TYPES } from "./tile-types";
import { useGroupSampleLayout } from "./use-group-sample-layout";
import { useGroupTileFacts } from "./use-group-tile-facts";
import { useGroupTilesOwnVisibility } from "./use-sample-tiles-active";

/**
 * The sample view on the tiling system: a header with the Layout menu, a
 * mosaic of built-in content, and plugin panels as further tiles.
 *
 * Regular groups in explore mode get carousel, media and 3D as separate
 * tile kinds. Everything else (plain samples, dynamic groups, groups in
 * annotate mode) hosts the existing sample view as one sample tile, with
 * the dynamic-group paginator moved into the host footer. No timeline:
 * group elements are switched with the paginator, not scrubbed.
 */
export const SampleTilingHost = () => {
  const facts = useGroupTileFacts();
  const datasetId = fos.useCurrentDatasetId();
  const datasetName = fos.useCurrentDatasetName();
  const groupTilesOwnVisibility = useGroupTilesOwnVisibility();
  const kind = facts.sampleOnly ? "sample" : "group";
  const resolved = useGroupSampleLayout(facts, datasetId, kind);
  const showsPaginator = useShowsDynamicGroupPaginator();

  // The Spaces strip this host replaces persisted its tabs under this key.
  useEffect(() => {
    try {
      globalThis.localStorage?.removeItem(LEGACY_SAMPLE_PANELS_STORAGE_KEY);
    } catch {
      // storage unavailable: nothing to clean up
    }
  }, []);

  const hostValue = useMemo(
    () => ({ hostsPaginator: showsPaginator }),
    [showsPaginator],
  );

  return (
    <div className={root} data-cy="sample-tiles">
      <SampleTilesHostContext.Provider value={hostValue}>
        <TilingProvider
          key={`${datasetId ?? "dataset"}:${kind}`}
          initialTiles={resolved.initialTiles}
          initialLayout={resolved.initialLayout}
          initialExpandedTileId={resolved.initialExpandedTileId}
          resetTiles={resolved.resetTiles}
          resetLayout={resolved.resetLayout}
        >
          <RegisterTiles facts={facts} />
          <SampleViewPanelsControllerBinding />
          {datasetId && (
            <GroupLayoutPersistence datasetId={datasetId} kind={kind} />
          )}
          {groupTilesOwnVisibility && <GroupVisibilityBridge />}
          <EnsureGroupSample>
            <TilesLayout
              fileName={datasetName ?? ""}
              showSlice={groupTilesOwnVisibility}
            />
          </EnsureGroupSample>
          {showsPaginator && (
            <div className={footerHost}>
              <DynamicGroupPaginator />
            </div>
          )}
        </TilingProvider>
      </SampleTilesHostContext.Provider>
    </div>
  );
};

/**
 * Keeps the registry in step with what this dataset offers: built-in
 * content first, then one kind per plugin panel on the sample-view surface.
 */
const RegisterTiles = ({ facts }: { facts: GroupTileFacts }) => {
  const { registerTile } = useTileRegistry();
  const panelTiles = useRegisteredPanelTiles();
  const entries = useMemo(
    () => [...registeredGroupTiles(facts), ...panelTiles],
    [facts, panelTiles],
  );

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

const TilesLayout = ({
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

  // Built-in kinds, and panels that don't allow duplicates, appear once:
  // refuse a change to such a kind when it is already shown elsewhere.
  const singletonPanelTypes = useSingletonPanelTileTypes();
  const handleChangeTileType = useCallback(
    (id: string, type: string) => {
      const singleton =
        (GROUP_TILE_TYPES as readonly string[]).includes(type) ||
        singletonPanelTypes.has(type);
      const present = Object.entries(tiles).some(
        ([tileId, tile]) => tileId !== id && tile.type === type,
      );
      if (!singleton || !present) changeTileType(id, type);
    },
    [changeTileType, singletonPanelTypes, tiles],
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

export default SampleTilingHost;
