import useSetView from "./useSetView";

/**
 * @deprecated use {@link [useSetView](../hooks/useSetView.ts)} instead
 */
const useReset = () => {
  return useSetView();
};

export default useReset;
