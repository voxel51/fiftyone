import { useTrackEvent } from "@fiftyone/analytics";
import { getCategoryLabel } from "@fiftyone/plugins";
import { useTiling, useTileTypes } from "@fiftyone/tiling";
import {
  IconName,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSubmenuItem,
} from "@voxel51/voodo";
import { useMemo } from "react";
import {
  createPanelTile,
  isPanelTileType,
  PANEL_CATEGORY_ORDER,
  panelCategory,
  panelTileIcon,
  panelTileType,
  useCanAddPanelTile,
  useModalPanelRegistrations,
  type ModalPanelRegistration,
  type PanelCategory,
} from "./panel-tiles";

/**
 * Layout menu for the group sample view: the built-in kinds not already on
 * the canvas, then a "Panels" submenu listing plugin panels grouped by
 * category as the grid "+" menu does. Built-in group content is a singleton
 * per kind (two media tiles would mount two lookers on the same sample);
 * panels follow their own `allowDuplicates` option.
 */
export const GroupAddTileMenu = () => {
  const types = useTileTypes();
  const { addTile, tiles } = useTiling();
  const panels = useModalPanelRegistrations();
  const canAddPanel = useCanAddPanelTile();
  const trackEvent = useTrackEvent();
  const present = useMemo(
    () => new Set(Object.values(tiles).map((tile) => tile.type)),
    [tiles],
  );
  const builtIns = types.filter(
    (entry) => !isPanelTileType(entry.type) && !present.has(entry.type),
  );
  const categories = useMemo(() => {
    const byCategory = new Map<PanelCategory, ModalPanelRegistration[]>();
    for (const panel of panels) {
      if (!canAddPanel(panel, present)) continue;
      const category = panelCategory(panel);
      const list = byCategory.get(category) ?? [];
      list.push(panel);
      byCategory.set(category, list);
    }
    return PANEL_CATEGORY_ORDER.filter((category) =>
      byCategory.has(category),
    ).map((category) => ({
      category,
      label: getCategoryLabel(category),
      panels: byCategory.get(category) ?? [],
    }));
  }, [canAddPanel, panels, present]);

  return (
    <>
      {builtIns.map((entry) => {
        const TileComponent = entry.Tile;
        return (
          <MenuIconTextItem
            key={entry.type}
            icon={entry.icon}
            text={entry.typeLabel}
            onClick={() => {
              addTile(
                {
                  render: () => <TileComponent />,
                  title: entry.typeLabel,
                  type: entry.type,
                },
                { idPrefix: entry.type },
              );
            }}
          />
        );
      })}
      {categories.length > 0 && (
        <MenuSubmenuItem icon={IconName.Puzzle} text="Panels">
          {categories.map(({ category, label, panels: categoryPanels }) => (
            <div key={category} data-cy={`group-tile-panels-${category}`}>
              <MenuSectionTitle>{label}</MenuSectionTitle>
              {categoryPanels.map((panel) => (
                <MenuIconTextItem
                  key={panel.name}
                  icon={panelTileIcon(panel)}
                  text={panel.label ?? panel.name}
                  data-cy={`group-tile-panel-${panel.name}`}
                  onClick={() => {
                    trackEvent("open_panel", { panel: panel.name });
                    addTile(createPanelTile(panel.name, panel.label), {
                      idPrefix: panelTileType(panel.name),
                    });
                  }}
                />
              ))}
            </div>
          ))}
        </MenuSubmenuItem>
      )}
    </>
  );
};
