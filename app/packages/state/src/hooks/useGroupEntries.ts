import * as fos from "@fiftyone/state";
import { removeKeys } from "@fiftyone/utilities";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { groupLength, replace } from "../recoil/groupEntries";

export const useRenameGroup = (mutable: boolean, group: string) => {
  const callback = useRecoilCallback(
    ({ set, snapshot }) =>
      async (newName: string) => {
        newName = newName.toLowerCase();

        const current = await snapshot.getPromise(
          fos.sidebarGroupsDefinition(false)
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
          fos.groupShown({ modal: false, group, loading: true })
        );

        replace[newName] = group;

        set(
          fos.groupShown({ group: newName, modal: false, loading: true }),
          shown
        );
        set(fos.sidebarGroupsDefinition(false), newGroups);

        fos.persistSidebarGroups({
          dataset: await snapshot.getPromise(fos.datasetName),
          stages: view,
          sidebarGroups: newGroups,
          subscription: await snapshot.getPromise(fos.stateSubscription),
        });
        return true;
      },
    [group]
  );

  if (mutable) {
    return callback;
  }

  return undefined;
};

export const useDeleteGroup = (mutable: boolean, group: string) => {
  const numFields = useRecoilValue(groupLength({ modal: false, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        const groups = await snapshot.getPromise(
          fos.sidebarGroups({ modal: false, loading: true })
        );
        set(
          fos.sidebarGroups({ modal: false, loading: true }),
          groups.filter(({ name }) => name !== group)
        );
      },
    []
  );

  if (numFields || !mutable) {
    return undefined;
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
