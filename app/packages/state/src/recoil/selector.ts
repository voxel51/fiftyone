import * as recoil from "recoil";

const mockedValuesState = recoil.atom({
  key: "MockedValues",
  default: new recoil.DefaultValue(),
});

export const mockedSelector = <T>(opts): recoil.RecoilState<T> => {
  const baseSelector = recoil.selector<T>(...opts);

  if (!TESTING_ENVIRONMENT) {
    return baseSelector;
  } else {
    return recoil.selector({
      ...opts,
      key: opts.key + "/mocked",
      get: ({ get }) => {
        const mockedValue = get(mockedValuesState);
        return mockedValue instanceof recoil.DefaultValue
          ? get(baseSelector)
          : mockedValue;
      },
    });
  }
};
