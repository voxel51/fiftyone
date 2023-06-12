import { useRelayEnvironment } from "react-relay";
import {
  RecoilState,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import {
  currentModalNavigation,
  currentModalSample,
  groupSlice,
  groupStatistics,
} from "../recoil";
import * as atoms from "../recoil/atoms";
import * as filterAtoms from "../recoil/filters";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import * as sidebarAtoms from "../recoil/sidebar";

export default () => {
  const environment = useRelayEnvironment();
  const setModal = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (
        id: string,
        index: number,
        getIndex: (index: number) => Promise<string>
      ) => {
        set(currentModalSample, { id, index });
        set(currentModalNavigation, () => getIndex);
      },
    []
  );

  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        id: string,
        index: number,
        getIndex: (index: number) => Promise<string>
      ) => {
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

          [groupStatistics(true), groupStatistics(false)],

          [groupSlice(true), groupSlice(false)],
        ];

        const results = await Promise.all(
          data.map(([_, get]) => snapshot.getPromise(get as RecoilState<any>))
        );

        for (const i in results) {
          set(data[i][0], results[i]);
        }

        setModal(id, index, getIndex);
      },
    [environment, setModal]
  );
};
