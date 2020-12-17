import { useSetRecoilState } from "recoil";

export interface SelectedObjectData {
  sample_id: string;
  field: string;
  frame_number: number;
}

export interface SelectedObject extends SelectedObjectData {
  object_id: string;
}

export type SelectedObjectMap = {
  [object_id: string]: SelectedObjectData;
};

export const useToggleSelectionObject = (atom) => {
  const setSelection = useSetRecoilState(atom);
  return (object_id: string, data: SelectedObjectData) =>
    setSelection((selection: SelectedObjectMap) => {
      if (selection.hasOwnProperty(object_id)) {
        return removeObjectIDsFromSelection(selection, [object_id]);
      } else {
        return addObjectsToSelection(selection, [{ object_id, ...data }]);
      }
    });
};

export const addObjectsToSelection = (
  selection: SelectedObjectMap,
  objects: SelectedObject[]
): SelectedObjectMap => {
  const newSelection = { ...selection };
  for (const { object_id, ...data } of objects) {
    if (data.frame_number === null) {
      delete data.frame_number;
    }
    newSelection[object_id] = data;
  }
  return newSelection;
};

export const removeObjectIDsFromSelection = (
  selection: SelectedObjectMap,
  objectIDs: string[]
) => {
  const newSelection = { ...selection };
  for (const id of objectIDs) {
    delete newSelection[id];
  }
  return newSelection;
};

export const removeMatchingObjectsFromSelection = (
  selection: SelectedObjectMap,
  filter: SelectedObjectData
) => {
  const newSelection = { ...selection };
  if (Object.keys(filter).length) {
    for (const [object_id, data] of Object.entries(selection)) {
      if (
        (filter.sample_id === undefined ||
          filter.sample_id === data.sample_id) &&
        (filter.field === undefined || filter.field === data.field) &&
        (filter.frame_number === undefined ||
          filter.frame_number === data.frame_number)
      ) {
        delete newSelection[object_id];
      }
    }
  }
  return newSelection;
};

export const convertSelectedObjectsMapToList = (
  map: SelectedObjectMap
): SelectedObject[] => {
  return Object.entries(map).map(([object_id, data]) => ({
    object_id,
    ...data,
  }));
};

export const convertSelectedObjectsListToMap = (
  list: SelectedObject[]
): SelectedObjectMap => {
  return list.reduce((map, { object_id, ...data }) => {
    map[object_id] = data;
    return map;
  }, {});
};
