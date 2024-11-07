import type { CallbackInterface, RecoilState } from "recoil";

import { useRelayEnvironment } from "react-relay";
import { useRecoilCallback } from "recoil";
import { dynamicGroupsViewMode } from "../recoil";
import * as atoms from "../recoil/atoms";
import * as filterAtoms from "../recoil/filters";
import * as groupAtoms from "../recoil/groups";
import * as modalAtoms from "../recoil/modal";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import * as sidebarAtoms from "../recoil/sidebar";
import * as sidebarExpandedAtoms from "../recoil/sidebarExpanded";

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

/**
 * Initializer that applys relevant grid settings to the modal, e.g. sidebar
 * checkboxes. If no navigation is provided, next/previous in the modal is
 * disabled
 */
export default () => {
  const environment = useRelayEnvironment();
  return useRecoilCallback(
    (cbInterface) => async (navigation?: modalAtoms.ModalNavigation) => {
      const { snapshot, set } = cbInterface;
      const data = [
        ...["colorBy", "multicolorKeypoints", "showSkeletons"].map((key) => {
          return [
            selectors.appConfigOption({ key, modal: false }),
            selectors.appConfigOption({ key, modal: false }),
          ];
        }),

        [dynamicGroupsViewMode(true), dynamicGroupsViewMode(false)],

        [atoms.cropToContent(true), atoms.cropToContent(false)],
        [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
        [groupAtoms.groupStatistics(true), groupAtoms.groupStatistics(false)],
        [groupAtoms.modalGroupSlice, groupAtoms.groupSlice],
        [
          schemaAtoms.activeFields({ modal: true }),
          schemaAtoms.activeFields({ modal: false }),
        ],
        [
          sidebarAtoms.sidebarGroupsDefinition(true),
          sidebarAtoms.sidebarGroupsDefinition(false),
        ],
        [sidebarAtoms.sidebarWidth(true), sidebarAtoms.sidebarWidth(false)],
        [sidebarAtoms.textFilter(true), sidebarAtoms.textFilter(false)],
        [
          sidebarExpandedAtoms.sidebarExpandedStore(true),
          sidebarExpandedAtoms.sidebarExpandedStore(false),
        ],
      ];

      const slice = await snapshot.getPromise(groupAtoms.groupSlice);

      let pinned3d = false;
      let activeSlices = [];
      if (slice) {
        // when a 3D slice is shown in the grid for group datasets, attempt
        // to find an alternative 2D slice to present by default in the main
        // view
        const map = await snapshot.getPromise(groupAtoms.groupMediaTypesMap);
        if (map[slice] === "point_cloud") {
          pinned3d = true;
          activeSlices = [slice];
        }
      }

      set(groupAtoms.pinned3d, pinned3d);
      set(groupAtoms.active3dSlices, activeSlices);

      const results = await Promise.all(
        data.map(([_, get]) => snapshot.getPromise(get as RecoilState<unknown>))
      );

      for (const i in results) {
        set(data[i][0], results[i]);
      }
      // do not set modal filters from grid when navigation is not provided
      navigation && (await setModalFilters(cbInterface));
      navigation && modalAtoms.modalNavigation.set(navigation);
    },
    [environment]
  );
};
