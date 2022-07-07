import { useRelayEnvironment } from "react-relay";
import { RecoilState, useRecoilCallback } from "recoil";

import * as atoms from "../recoil/atoms";
import * as filterAtoms from "../recoil/filters";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import * as sidebarAtoms from "../recoil/sidebar";
import useSetExpandedSample from "./useSetExpandedSample";

export default () => {
  const environment = useRelayEnvironment();
  const setExpandedSample = useSetExpandedSample();

  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sample: atoms.SampleData, navigation?: atoms.ModalNavigation) => {
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

        setExpandedSample(sample, navigation);
      },
    [environment]
  );
};
