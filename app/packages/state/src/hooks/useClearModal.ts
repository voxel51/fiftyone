import { createContext, useCallback, useContext } from "react";
import useResetModal from "./useResetModal";

/**
 * Where the URL owns the open sample, the host navigates away from it and the
 * session follows from the URL. Returns whether it navigated.
 */
export const CloseSampleContext = createContext<(() => boolean) | undefined>(
  undefined,
);

/**
 * A react hook that closes the modal: through the URL where the host routes
 * it, else by resetting the modal state directly.
 *
 * @example
 * ```ts
 * function MyComponent() {
 *   const clearModal = useClearModal();
 *   return (
 *    <button onClick={clearModal}>Close Modal</button>
 *   )
 * }
 * ```
 */
export default () => {
  const navigate = useContext(CloseSampleContext);
  const reset = useResetModal();

  return useCallback(() => {
    if (navigate?.()) return;
    reset();
  }, [navigate, reset]);
};
