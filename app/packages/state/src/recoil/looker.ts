import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { selectorFamily, useRecoilValue, useRecoilValueLoadable } from "recoil";

import * as atoms from "./atoms";
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
            loop: get(
              selectors.appConfigOption({ modal: true, key: "loopVideos" })
            ),
          }
        : {};

      return {
        showConfidence,
        showControls: true,
        showIndex,
        showLabel,
        useFrameNumber,
        showTooltip,
        ...video,
        coloring: get(colorAtoms.coloring(modal)),
        ...get(atoms.savedLookerOptions),
        selectedLabels: [...get(selectors.selectedLabelIds)],
        fullscreen: get(atoms.fullscreen),
        filter: withFilter ? get(pathFilter(modal)) : undefined,
        activePaths: get(schemaAtoms.activeFields({ modal })),
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(modal)),
        loop: true,
        timeZone: get(selectors.timeZone),
        showOverlays: modal ? get(atoms.showOverlays) : true,
        alpha: get(atoms.alpha(modal)),
        showSkeletons: get(
          selectors.appConfigOption({ key: "showSkeletons", modal })
        ),
        defaultSkeleton: get(atoms.dataset).defaultSkeleton,
        skeletons: Object.fromEntries(
          get(atoms.dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
        ),
        pointFilter: get(skeletonFilter(modal)),
      };
    },
});

export const useLookerOptions = (modal: boolean) => {
  const loaded = useRecoilValueLoadable(
    lookerOptions({ modal, withFilter: true })
  );

  const loading = useRecoilValue(lookerOptions({ modal, withFilter: false }));
  return loaded.contents instanceof Promise ? loading : loaded.contents;
};
