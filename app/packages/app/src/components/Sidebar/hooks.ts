const useRenameGroup = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async (newName: string) => {
      const groups = await snapshot.getPromise(sidebarGroups(modal));
      set(
        sidebarGroups(modal),
        groups.map<[string, string[]]>(([name, paths]) => [
          name === group ? newName : name,
          paths,
        ])
      );
    },
    []
  );
};

const useDeleteGroup = (modal: boolean, group: string) => {
  const numFields = useRecoilValue(numGroupFields({ modal, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const groups = await snapshot.getPromise(sidebarGroups(modal));
      set(
        sidebarGroups(modal),
        groups.filter(([name]) => name !== group)
      );
    },
    []
  );

  if (numFields) {
    return null;
  }

  return onDelete;
};

const useClearActive = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const paths = await snapshot.getPromise(sidebarGroup({ modal, group }));
      const active = await snapshot.getPromise(
        schemaAtoms.activeFields({ modal })
      );

      set(
        schemaAtoms.activeFields({ modal }),
        active.filter((p) => !paths.includes(p))
      );
    },
    [modal, group]
  );
};

const useClearFiltered = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const paths = await snapshot.getPromise(sidebarGroup({ modal, group }));
      const filters = await snapshot.getPromise(
        modal ? filterAtoms.modalFilters : filterAtoms.filters
      );
      set(
        modal ? filterAtoms.modalFilters : filterAtoms.filters,
        removeKeys(filters, paths)
      );
    },
    [modal, group]
  );
};
