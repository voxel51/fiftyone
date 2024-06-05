import type * as foq from "@fiftyone/relay";
import type { CallbackInterface, RecoilState } from "recoil";
import type { ResponseFrom } from "../utils";

import { get } from "lodash";
import { useRelayEnvironment } from "react-relay";
import { useRecoilCallback } from "recoil";
import * as atoms from "../recoil/atoms";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as filterAtoms from "../recoil/filters";
import * as groupAtoms from "../recoil/groups";
import * as modalAtoms from "../recoil/modal";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import * as sidebarAtoms from "../recoil/sidebar";
import { getSanitizedGroupByExpression } from "../recoil/utils";
import useSetExpandedSample from "./useSetExpandedSample";

export type Sample =
  ResponseFrom<foq.paginateSamplesQuery>["samples"]["edges"][0]["node"];

const setModalFilters = async ({ snapshot, set }: CallbackInterface) => {
  const paths = await snapshot.getPromise(
    schemaAtoms.labelPaths({ expanded: false })
  );
  const filters = await snapshot.getPromise(filterAtoms.filters);
  const modalFilters = Object.fromEntries(
    Object.entries(filters).filter(
      ([path]) =>
        paths.some((p) => path.startsWith(p)) || path === "_label_tags"
    )
  );

  set(filterAtoms.modalFilters, modalFilters);
};

export default () => {
  const environment = useRelayEnvironment();
  const setExpandedSample = useSetExpandedSample();

  const setModalState = useRecoilCallback(
    (cbInterface) => async (navigation: modalAtoms.ModalNavigation) => {
      const { snapshot, set } = cbInterface;
      const data = [
        [filterAtoms.modalFilters, filterAtoms.filters],
        ...["colorBy", "multicolorKeypoints", "showSkeletons"].map((key) => {
          return [
            selectors.appConfigOption({ key, modal: false }),
            selectors.appConfigOption({ key, modal: false }),
          ];
        }),
        [
          schemaAtoms.activeFields({ modal: true }),
          schemaAtoms.activeFields({ modal: false }),
        ],
        [atoms.cropToContent(true), atoms.cropToContent(false)],
        [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
        [
          sidebarAtoms.sidebarGroupsDefinition(true),
          sidebarAtoms.sidebarGroupsDefinition(false),
        ],
        [sidebarAtoms.sidebarWidth(true), sidebarAtoms.sidebarWidth(false)],
        [sidebarAtoms.sidebarVisible(true), sidebarAtoms.sidebarVisible(false)],
        [sidebarAtoms.textFilter(true), sidebarAtoms.textFilter(false)],

        [groupAtoms.groupStatistics(true), groupAtoms.groupStatistics(false)],
      ];

      const slice = await snapshot.getPromise(groupAtoms.groupSlice);

      let pinned3d = false;
      let activeSlices = [];
      if (slice) {
        const map = await snapshot.getPromise(groupAtoms.groupMediaTypesMap);
        if (map[slice] === "point_cloud") {
          pinned3d = true;
          activeSlices = [slice];
        }
      }

      set(groupAtoms.pinned3d, pinned3d);
      set(groupAtoms.activePcdSlices, activeSlices);

      const results = await Promise.all(
        data.map(([_, get]) => snapshot.getPromise(get as RecoilState<unknown>))
      );

      for (const i in results) {
        set(data[i][0], results[i]);
      }
      await setModalFilters(cbInterface);

      set(modalAtoms.currentModalNavigation, () => navigation);
    },
    [environment]
  );

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (id: symbol, event: MouseEvent) => {
        if (event.ctrlKey || event.metaKey) {
          set(atoms.selectedSamples, (selected) => {
            const newSelected = new Set([...selected]);
            if (newSelected.has(id.description)) {
              newSelected.delete(id.description);
            } else {
              newSelected.add(id.description);
            }

            return newSelected;
          });
          return;
        }

        const hasGroupSlices = await snapshot.getPromise(
          groupAtoms.hasGroupSlices
        );
        const groupField = await snapshot.getPromise(groupAtoms.groupField);
        const dynamicGroupParameters = await snapshot.getPromise(
          dynamicGroupAtoms.dynamicGroupParameters
        );

        const getItemAtIndex = async (index: number) => {
          if (!store.indices.has(index)) await next();

          const id = store.indices.get(index);

          if (!id) {
            throw new Error(
              `unable to paginate to next sample, index = ${index}`
            );
          }

          const sample = store.samples.get(id);

          let groupId: string;
          if (hasGroupSlices) {
            groupId = get(sample.sample, groupField)._id as string;
          }

          let groupByFieldValue: string;
          if (dynamicGroupParameters?.groupBy) {
            groupByFieldValue = String(
              get(
                sample.sample,
                getSanitizedGroupByExpression(dynamicGroupParameters.groupBy)
              )
            );
          }

          return { id, groupId, groupByFieldValue };
        };

        setModalState(getItemAtIndex).then(() =>
          setExpandedSample(clickedIndex)
        );
      },
    [setExpandedSample, setModalState, store]
  );
};
