import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import {
  selectorFamily,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { pathFilter } from "../components/Filters";
import { skeletonFilter } from "../components/Filters/utils";

import * as atoms from "./atoms";
import * as colorAtoms from "./color";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import * as viewAtoms from "./view";

type Lookers = FrameLooker | ImageLooker | VideoLooker;

const lookerOptions = selectorFamily<
  Partial<Omit<ReturnType<Lookers["getDefaultOptions"]>, "selected">>,
  { withFilter: boolean; modal: boolean }
>({
  key: "gridLookerOptions",
  get: ({ modal, withFilter }) => ({ get }) => {
    return {
      coloring: get(colorAtoms.coloring(modal)),
      filter: withFilter ? get(pathFilter(modal)) : undefined,
      activePaths: get(schemaAtoms.activeFields({ modal })),
      zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(modal)),
      loop: true,
      timeZone: get(selectors.timeZone),
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

export const useClearModal = () => {
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) => () => {
      const fullscreen = get(atoms.fullscreen);
      if (fullscreen) {
        return;
      }
      const currentOptions = get(atoms.savedLookerOptions);
      set(atoms.savedLookerOptions, { ...currentOptions, showJSON: false });
      set(atoms.selectedLabels, {});
      set(atoms.hiddenLabels, {});
      set(atoms.modal, null);
    },
    []
  );
};
