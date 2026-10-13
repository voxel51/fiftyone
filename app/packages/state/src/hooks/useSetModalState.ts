import type { CallbackInterface, RecoilState } from "recoil";

import { useEffect } from "react";
import { useRelayEnvironment } from "react-relay";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as atoms from "../recoil/atoms";
import * as filterAtoms from "../recoil/filters";
import * as groupAtoms from "../recoil/groups";
import * as group3dAtoms from "../recoil/renderConfig3d.atoms";
import * as modalAtoms from "../recoil/modal";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import * as sidebarAtoms from "../recoil/sidebar";
import * as sidebarExpandedAtoms from "../recoil/sidebarExpanded";
import { is3d } from "@fiftyone/utilities";

const setModalFilters = async ({ snapshot, set }: CallbackInterface) => {
  const paths = await snapshot.getPromise(
    schemaAtoms.labelPaths({ expanded: false }),
  );
  const filters = await snapshot.getPromise(filterAtoms.filters);
  const modalFilters = Object.fromEntries(
    Object.entries(filters).filter(
      ([path]) =>
        paths.some((p) => path.startsWith(p)) || path === "_label_tags",
    ),
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

        [atoms.cropToContent(true), atoms.cropToContent(false)],
        [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
        [groupAtoms.groupStatistics(true), groupAtoms.groupStatistics(false)],
        [groupAtoms.modalGroupSlice, groupAtoms.groupSlice],
        // The grid's stored choice, not its resolved list: the resolved
        // list leaves out the fields the current schema hides, which then
        // stayed inactive in the modal once a schema switch showed them
        [
          schemaAtoms._activeFields({ modal: true }),
          schemaAtoms._activeFields({ modal: false }),
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
      const map = await snapshot.getPromise(groupAtoms.groupMediaTypesMap);
      const pinned3d = Boolean(slice && is3d(map[slice]));
      const activeSlices = pinned3d && slice ? [slice] : [];

      set(group3dAtoms.is3dPinned, pinned3d);
      set(group3dAtoms.active3dSlices, activeSlices);
      set(group3dAtoms.pinned3DSampleSlice, pinned3d ? slice : null);

      const results = await Promise.all(
        data.map(([_, get]) =>
          snapshot.getPromise(get as RecoilState<unknown>),
        ),
      );

      for (const i in results) {
        set(data[i][0], results[i]);
      }
      // do not set modal filters from grid when navigation is not provided
      navigation && (await setModalFilters(cbInterface));
      navigation && modalAtoms.modalNavigation.set(navigation);
    },
    [environment],
  );
};

/**
 * Adds the paths the grid's sidebar groups gain while the modal is open,
 * for example fields a schema switch shows again or a newly created
 * field, to the modal's groups, which are otherwise the copy taken when
 * the modal opened.
 */
export const useSyncModalSidebarGroups = () => {
  const gridGroups = useRecoilValue(
    sidebarAtoms.sidebarGroupsDefinition(false),
  );
  const setModalGroups = useSetRecoilState(
    sidebarAtoms.sidebarGroupsDefinition(true),
  );

  useEffect(() => {
    setModalGroups((modalGroups) =>
      sidebarAtoms.withMissingSidebarPaths(modalGroups, gridGroups),
    );
  }, [gridGroups, setModalGroups]);
};
