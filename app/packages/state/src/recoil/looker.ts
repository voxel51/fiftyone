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
import { pathFilter } from "./pathFilters";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import skeletonFilter from "./skeletonFilter";
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

      return {
        showJSON: panels.json.isOpen,
        showHelp: panels.help.isOpen,
        showConfidence,
        showControls: true,
        showIndex,
        showLabel,
        useFrameNumber,
        showTooltip,
        ...video,
        isPointcloudDataset: get(selectors.isPointcloudDataset),
        coloring: get(colorAtoms.coloring),
        customizeColorSetting: get(atoms.sessionColorScheme).fields ?? [],
        attributeVisibility: get(attributeVisibility),
        ...get(atoms.savedLookerOptions),
        selectedLabels: [...get(selectors.selectedLabelIds)],
        fullscreen: get(atoms.fullscreen),
        filter: withFilter ? get(pathFilter(modal)) : undefined,
        activePaths: get(schemaAtoms.activeFields({ modal })),
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(modal)),
        timeZone: get(selectors.timeZone),
        showOverlays: modal ? get(atoms.showOverlays) : true,
        alpha: get(atoms.alpha),
        showSkeletons: get(
          selectors.appConfigOption({ key: "showSkeletons", modal: false })
        ),
        defaultSkeleton: get(atoms.dataset).defaultSkeleton,
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
