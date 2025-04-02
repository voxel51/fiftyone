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
import { dataset } from "./dataset";
import { filters, modalFilters } from "./filters";
import { pathFilter } from "./pathFilters";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import skeletonFilter from "./skeletonFilter";
import { State } from "./types";
import * as viewAtoms from "./view";

type Lookers = FrameLooker | ImageLooker | VideoLooker;

export const lookerOptions = selectorFamily<
  Partial<Omit<ReturnType<Lookers["getDefaultOptions"]>, "selected">>,
  { withFilter: boolean; modal: boolean }
>({
  key: "gridLookerOptions",
  get:
    ({ modal, withFilter }) =>
    ({ get }) => {
      const globalMediaFallback = Boolean(
        get(selectors.appConfigOption({ modal: true, key: "mediaFallback" }))
      );
      const datasetMediaFallback = Boolean(
        get(selectors.datasetAppConfig)?.mediaFallback
      );
      const mediaFallback = globalMediaFallback || datasetMediaFallback;

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
      const colorscale = {
        default: get(atoms.colorScheme).defaultColorscale ?? {},
        fields: get(atoms.colorScheme).colorscales ?? [],
      };

      let extra = {};

      // modal only configuration
      if (modal) {
        const panels = get(atoms.lookerPanels);
        extra = {
          showConfidence: get(
            selectors.appConfigOption({ modal: true, key: "showConfidence" })
          ),
          showControls: true,
          showTooltip: get(
            selectors.appConfigOption({ modal: true, key: "showTooltip" })
          ),
          showHelp: panels.help.isOpen,
          showIndex: get(
            selectors.appConfigOption({ modal: true, key: "showIndex" })
          ),
          showJSON: panels.json.isOpen,
          showLabel: get(
            selectors.appConfigOption({ modal: true, key: "showLabel" })
          ),
          useFrameNumber: get(
            selectors.appConfigOption({ modal: true, key: "useFrameNumber" })
          ),
          ...get(atoms.savedLookerOptions),
        };
      }

      return {
        activePaths,
        ...video,
        isPointcloudDataset: get(selectors.is3DDataset),
        coloring: get(colorAtoms.coloring),
        customizeColorSetting: get(atoms.colorScheme).fields ?? [],
        labelTagColors: get(atoms.colorScheme).labelTags ?? {},
        colorscale: colorscale,
        attributeVisibility: activeVisibility,
        selectedLabels: [...get(selectors.selectedLabelIds)],
        selectedLabelTags: getActiveLabelTags(
          isLabelTagActive,
          activeFilter,
          activeVisibility
        ),
        filter: withFilter ? get(pathFilter(modal)) : undefined,
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(modal)),
        timeZone: get(selectors.timeZone),
        showOverlays: modal ? get(atoms.showOverlays) : true,
        alpha: get(atoms.colorScheme).opacity,
        showSkeletons: get(atoms.colorScheme).showSkeletons,
        defaultSkeleton: get(dataset)?.defaultSkeleton,
        skeletons: Object.fromEntries(
          get(dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
        ),
        pointFilter: get(skeletonFilter(modal)),
        mediaFallback,
        ...extra,
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
