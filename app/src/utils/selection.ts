import { useSetRecoilState } from "recoil";

export interface SelectedObjectData {
  sample_id: string;
  field: string;
  frame_number: number;
}

export interface SelectedObject extends SelectedObjectData {
  label_id: string;
}

export type SelectedObjectMap = {
  [label_id: string]: SelectedObjectData;
};

export const useToggleSelectionObject = (atom) => {
  const setSelection = useSetRecoilState(atom);
  return (label_id: string, data: SelectedObjectData) =>
    setSelection((selection: SelectedObjectMap) => {
      if (selection.hasOwnProperty(label_id)) {
        return removeObjectIDsFromSelection(selection, [label_id]);
      } else {
        return addObjectsToSelection(selection, [{ label_id, ...data }]);
      }
    });
};

export const addObjectsToSelection = (
  selection: SelectedObjectMap,
  objects: SelectedObject[]
): SelectedObjectMap => {
  const newSelection = { ...selection };
  for (const { label_id, ...data } of objects) {
    if (data.frame_number === null) {
      delete data.frame_number;
    }
    newSelection[label_id] = data;
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
    for (const [label_id, data] of Object.entries(selection)) {
      if (
        (filter.sample_id === undefined ||
          filter.sample_id === data.sample_id) &&
        (filter.field === undefined || filter.field === data.field) &&
        (filter.frame_number === undefined ||
          filter.frame_number === data.frame_number)
      ) {
        delete newSelection[label_id];
      }
    }
  }
  return newSelection;
};

export const convertSelectedObjectsMapToList = (
  map: SelectedObjectMap
): SelectedObject[] => {
  return Object.entries(map).map(([label_id, data]) => ({
    label_id,
    ...data,
  }));
};

export const convertSelectedObjectsListToMap = (
  list: SelectedObject[]
): SelectedObjectMap => {
  return list.reduce((map, { label_id, ...data }) => {
    map[label_id] = data;
    return map;
  }, {});
};
