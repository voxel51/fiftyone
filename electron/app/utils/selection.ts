import { useSetRecoilState } from "recoil";

export const useToggleSelectionObject = (atom) => {
  const setSelection = useSetRecoilState(atom);
  return (key, data) =>
    setSelection((selection) => {
      const newSelection = { ...selection };
      if (selection.hasOwnProperty(key)) {
        delete newSelection[key];
      } else {
        newSelection[key] = data;
      }
      return newSelection;
    });
};
