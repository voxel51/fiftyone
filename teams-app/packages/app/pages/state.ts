import { atom } from "recoil";

export const { loading, setPending } = (() => {
  let setter: null | (() => void) = null;
  const loading = atom({
    key: "loadingTeams",
    default: false,
    effects: [
      ({ setSelf }) => {
        setter = () => setSelf(true);
      },
    ],
  });

  const setPending = () => {
    setter && setter();
  };

  return { loading, setPending };
})();
