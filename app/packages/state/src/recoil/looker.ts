import {
  FrameLooker,
  FrameOptions,
  ImageLooker,
  ImageOptions,
  VideoLooker,
  VideoOptions,
} from "@fiftyone/looker";
import { selectorFamily, useRecoilValue, useRecoilValueLoadable } from "recoil";

import * as atoms from "./atoms";
import { attributeVisibility } from "./attributeVisibility";
import * as colorAtoms from "./color";
import { filters, modalFilters } from "./filters";
import { pathFilter } from "./pathFilters";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import skeletonFilter from "./skeletonFilter";
import * as viewAtoms from "./view";
import { State } from "./types";

type Lookers = FrameLooker | ImageLooker | VideoLooker;

export const lookerOptions = selectorFamily<
  Partial<Omit<ReturnType<Lookers["getDefaultOptions"]>, "selected">>,
  { withFilter: boolean; modal: boolean }
>({
  key: "gridLookerOptions",
  get:
    ({ modal, withFilter }) =>
    ({ get }) => {
      const panels = get(atoms.lookerPanels);
      const showConfidence = get(
        selectors.appConfigOption({ modal: true, key: "showConfidence" })
      );
      const showIndex = get(
        selectors.appConfigOption({ modal: true, key: "showIndex" })
      );
      const showLabel = get(
        selectors.appConfigOption({ modal: true, key: "showLabel" })
      );
      const showTooltip = get(
        selectors.appConfigOption({ modal: true, key: "showTooltip" })
      );
      const useFrameNumber = get(
        selectors.appConfigOption({ modal: true, key: "useFrameNumber" })
      );

      const video = get(selectors.isVideoDataset)
        ? {
            loop: modal
              ? get(
                  selectors.appConfigOption({ modal: true, key: "loopVideos" })
                )
              : true,
          }
        : {};

      const activePaths = get(schemaAtoms.activeFields({ modal }));
      const activeFilter = withFilter
        ? modal
          ? get(modalFilters)
          : get(filters)
        : {};
      const activeVisibility = get(attributeVisibility);
      const isLabelTagActive = activePaths.includes("_label_tags");

      return {
        showJSON: panels.json.isOpen,
        showHelp: panels.help.isOpen,
        showConfidence,
        showControls: true,
        showIndex,
        showLabel,
        useFrameNumber,
        showTooltip,
        activePaths,
        ...video,
        isPointcloudDataset: get(selectors.isPointcloudDataset),
        coloring: get(colorAtoms.coloring),
        customizeColorSetting: get(atoms.colorScheme).fields ?? [],
        labelTagColors: get(atoms.colorScheme).labelTags ?? {},
        attributeVisibility: activeVisibility,
        ...get(atoms.savedLookerOptions),
        selectedLabels: [...get(selectors.selectedLabelIds)],
        selectedLabelTags: getActiveLabelTags(
          isLabelTagActive,
          activeFilter,
          activeVisibility
        ),
        fullscreen: get(atoms.fullscreen),
        filter: withFilter ? get(pathFilter(modal)) : undefined,
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(modal)),
        timeZone: get(selectors.timeZone),
        showOverlays: modal ? get(atoms.showOverlays) : true,
        alpha: get(atoms.colorScheme).opacity,
        showSkeletons: get(atoms.colorScheme).showSkeletons,
        defaultSkeleton: get(atoms.dataset)?.defaultSkeleton,
        skeletons: Object.fromEntries(
          get(atoms.dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
        ),
        pointFilter: get(skeletonFilter(modal)),
      };
    },
});

export const useLookerOptions = (
  modal: boolean
): Partial<Omit<FrameOptions | ImageOptions | VideoOptions, "selected">> => {
  const loaded = useRecoilValueLoadable(
    lookerOptions({ modal, withFilter: true })
  );

  const loading = useRecoilValue(lookerOptions({ modal, withFilter: false }));

  return loaded.contents instanceof Promise ? loading : loaded.contents;
};

const getActiveLabelTags = (
  isLabelTagActive: boolean,
  activeFilter: State.Filters,
  activeVisibility: State.Filters
) => {
  if (!isLabelTagActive) return null;
  const labelTagFilters = activeFilter["_label_tags"]?.values ?? [];
  const labelTagVisibility = activeVisibility["_label_tags"]?.values ?? [];
  if (labelTagFilters.length === 0) return labelTagVisibility;
  if (labelTagVisibility.length === 0) return labelTagFilters;
  return labelTagFilters.filter((tag) => labelTagVisibility.includes(tag));
};
