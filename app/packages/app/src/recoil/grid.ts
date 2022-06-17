import Flashlight, { FlashlightOptions } from "@fiftyone/flashlight";
import { toSnakeCase } from "@fiftyone/utilities";
import {
  atom,
  RecoilState,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import { similarityParameters } from "../components/Actions/Similar";
import { pathFilter } from "../components/Filters";
import { skeletonFilter } from "../components/Filters/utils";

import * as atoms from "./atoms";
import * as colorAtoms from "./color";
import * as filterAtoms from "./filters";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import * as sidebarAtoms from "./sidebar";
import { State } from "./types";
import * as viewAtoms from "./view";
import createStore from "../flashlightStore";
import { MutableRefObject, useCallback } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import {
  paginateGroup,
  paginateGroupQuery,
  paginateGroupQueryRef,
} from "../queries";

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(atoms.appConfig)?.gridZoom,
});

export const gridZoom = atom<number>({
  key: "gridZoom",
  default: defaultGridZoom,
});

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [0, 10],
});

export const gridFlashlightOptions = selector<FlashlightOptions>({
  key: "gridFlashlightOptions",
  get: ({ get }) => {
    return {
      rowAspectRatioThreshold:
        11 - Math.max(get(gridZoom), get(gridZoomRange)[0]),
    };
  },
});

export const pageParameters = selectorFamily<
  {
    filters: State.Filters;
    dataset: string;
    view: State.Stage[];
  },
  boolean
>({
  key: "pageParameters",
  get:
    (modal) =>
    ({ get }) => {
      const similarity = get(similarityParameters);
      return {
        filters: get(modal ? filterAtoms.filters : filterAtoms.modalFilters),
        view: get(viewAtoms.view),
        dataset: get(selectors.datasetName),
        similarity: similarity && !modal ? toSnakeCase(similarity) : null,
      };
    },
});

export const gridStore = createStore();

const lookerOptions = selectorFamily<
  any,
  { withFilter: boolean; modal: boolean }
>({
  key: "gridLookerOptions",
  get:
    (withFilter) =>
    ({ get }) => {
      return {
        coloring: get(colorAtoms.coloring(false)),
        filter: withFilter ? get(pathFilter(false)) : null,
        activePaths: get(schemaAtoms.activeFields({ modal: false })),
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(false)),
        loop: true,
        timeZone: get(selectors.timeZone),
        alpha: get(atoms.alpha(false)),
        showSkeletons: get(
          selectors.appConfigOption({ key: "showSkeletons", modal: false })
        ),
        defaultSkeleton: get(atoms.dataset).defaultSkeleton,
        skeletons: Object.fromEntries(
          get(atoms.dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
        ),
        pointFilter: get(skeletonFilter(false)),
        selected: get(atoms.selectedSamples).has(),
      };
    },
});

export const useLookerOptions = () => {
  const loaded = useRecoilValueLoadable(gridLookerOptions(true));

  const loading = useRecoilValue(gridLookerOptions(false));
  return loaded.contents instanceof Promise ? loading : loaded.contents;
};

export const useOpenModal = (
  flashlight: MutableRefObject<Flashlight<number>>
) => {
  const clearModal = useClearModal();
  const environment = useRelayEnvironment();
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        event: MouseEvent,
        sampleId: string,
        itemIndexMap: { [key: string]: number }
      ) => {
        const clickedIndex = itemIndexMap[sampleId];

        const getIndex = (index) => {
          const promise = gridStore.indices.has(index)
            ? Promise.resolve(
                gridStore.samples.get(gridStore.indices.get(index))
              )
            : flashlight.current.get()?.then(() => {
                return gridStore.indices.has(index)
                  ? gridStore.samples.get(gridStore.indices.get(index))
                  : null;
              });

          promise
            ? promise.then((sample) => {
                sample
                  ? set(atoms.modal, { ...sample, index, getIndex })
                  : clearModal();
              })
            : clearModal();
        };
        set(atoms.modal, {
          ...gridStore.samples.get(sampleId),
          index: clickedIndex,
          getIndex,
        });
        const dataset = await snapshot.getPromise(selectors.datasetName);
        const view = await snapshot.getPromise(viewAtoms.view);
        set(
          paginateGroupQueryRef,
          loadQuery<paginateGroupQuery>(environment, paginateGroup, {
            dataset,
            view,
          })
        );

        const data = [
          [filterAtoms.modalFilters, filterAtoms.filters],
          ...["colorBy", "multicolorKeypoints", "showSkeletons"].map((key) => {
            return [
              selectors.appConfigOption({ key, modal: true }),
              selectors.appConfigOption({ key, modal: false }),
            ];
          }),
          [
            schemaAtoms.activeFields({ modal: true }),
            schemaAtoms.activeFields({ modal: false }),
          ],
          [atoms.cropToContent(true), atoms.cropToContent(false)],
          [atoms.colorSeed(true), atoms.colorSeed(false)],
          [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
          [atoms.alpha(true), atoms.alpha(false)],
          [
            sidebarAtoms.sidebarGroupsDefinition(true),
            sidebarAtoms.sidebarGroupsDefinition(false),
          ],
          [sidebarAtoms.sidebarWidth(true), sidebarAtoms.sidebarWidth(false)],
          [
            sidebarAtoms.sidebarVisible(true),
            sidebarAtoms.sidebarVisible(false),
          ],
          [sidebarAtoms.textFilter(true), sidebarAtoms.textFilter(false)],
        ];

        const results = await Promise.all(
          data.map(([_, get]) => snapshot.getPromise(get as RecoilState<any>))
        );

        for (const i in results) {
          set(data[i][0], results[i]);
        }
      },
    [environment]
  );
};

export const useClearModal = () => {
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      () => {
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

export const useResizeGrid = () => {
  let zoom = useRecoilValue(gridZoom);
  const setZoomRange = useSetRecoilState(gridZoomRange);
  return useCallback(
    (width: number): FlashlightOptions => {
      let min = 7;

      if (width >= 1200) {
        min = 0;
      } else if (width >= 1000) {
        min = 2;
      } else if (width >= 800) {
        min = 4;
      }

      zoom = Math.max(min, zoom);
      setZoomRange([min, 10] as [number, number]);
      return {
        rowAspectRatioThreshold: 11 - zoom,
      };
    },
    [zoom]
  );
};
