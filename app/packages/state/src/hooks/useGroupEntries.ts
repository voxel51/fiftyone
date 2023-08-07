import * as fos from "@fiftyone/state";
import { removeKeys } from "@fiftyone/utilities";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { groupLength, replace } from "../recoil/groupEntries";

export const useRenameGroup = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (newName: string) => {
        newName = newName.toLowerCase();

        const current = await snapshot.getPromise(
          fos.sidebarGroupsDefinition(modal)
        );
        if (
          !fos.validateGroupName(
            current.map(({ name }) => name).filter((name) => name !== group),
            newName
          )
        ) {
          return false;
        }

        const newGroups = current.map(({ name, ...rest }) => ({
          name: name === group ? newName : name,
          ...rest,
        }));

        const view = await snapshot.getPromise(fos.view);
        const shown = await snapshot.getPromise(
          fos.groupShown({ modal, group, loading: true })
        );

        replace[newName] = group;

        set(fos.groupShown({ group: newName, modal, loading: true }), shown);
        set(fos.sidebarGroupsDefinition(modal), newGroups);
        !modal &&
          fos.persistSidebarGroups({
            dataset: await snapshot.getPromise(datasetName),
            stages: view,
            sidebarGroups: newGroups,
          });
        return true;
      },
    []
  );
};

export const useDeleteGroup = (modal: boolean, group: string) => {
  const numFields = useRecoilValue(groupLength({ modal, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        const groups = await snapshot.getPromise(
          fos.sidebarGroups({ modal, loading: true })
        );
        set(
          fos.sidebarGroups({ modal, loading: true }),
          groups.filter(({ name }) => name !== group)
        );
      },
    []
  );

  if (numFields) {
    return null;
  }

  return onDelete;
};

export const useClearActive = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        const paths = await snapshot.getPromise(
          fos.sidebarGroup({ modal, group, loading: true })
        );
        const active = await snapshot.getPromise(fos.activeFields({ modal }));

        set(
          fos.activeFields({ modal }),
          active.filter((p) => !paths.includes(p))
        );
      },
    [modal, group]
  );
};

export const useClearFiltered = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        const paths = await snapshot.getPromise(
          fos.sidebarGroup({ modal, group, loading: true })
        );
        const filters = await snapshot.getPromise(
          modal ? fos.modalFilters : fos.filters
        );

        set(
          modal ? fos.modalFilters : fos.filters,
          removeKeys(filters, paths, true)
        );
      },
    [modal, group]
  );
};

export const useClearVisibility = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        const paths = await snapshot.getPromise(
          fos.sidebarGroup({ modal, group, loading: true })
        );
        const visibility = await snapshot.getPromise(
          modal ? fos.modalAttributeVisibility : fos.attributeVisibility
        );

        set(
          modal ? fos.modalAttributeVisibility : fos.attributeVisibility,
          removeKeys(visibility, paths, true)
        );
      },
    [modal, group]
  );
};
