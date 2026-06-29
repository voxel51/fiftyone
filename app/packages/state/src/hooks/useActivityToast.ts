import { useEffect, useMemo, useState } from "react";
import { atom, useAtom } from "jotai";
import { IconName, Variant } from "@voxel51/voodo";

/**
 * Timeout value which will cause the activity toast to remain open indefinitely.
 */
export const INDEFINITE_TOAST_TIMEOUT = -1;

/**
 * Configuration data which drives ActivityToast behavior.
 */
export type ActivityToastConfig = {
  /**
   * Name of the icon to display in the toast.
   */
  iconName: IconName;

  /**
   * Message to display in the toast.
   */
  message: string;

  /**
   * Toast variant.
   */
  variant: Variant;

  /**
   * Visibility timeout in milliseconds;
   * the toast will disappear after this time has elapsed.
   *
   * This timeout is reset any time the toast configuration is modified.
   *
   * A negative timeout value will disable the timeout, causing
   * the toast to remain visible indefinitely.
   */
  timeout?: number;
};

/**
 * Activity toast interface.
 */
export interface IActivityToast {
  /**
   * Current toast configuration.
   */
  config: ActivityToastConfig;

  /**
   * `true` if the toast is open, else `false`.
   */
  open: boolean;

  /**
   * Set the toast configuration.
   *
   * @param config {@link ActivityToastConfig} data.
   */
  setConfig(config: ActivityToastConfig): void;

  /**
   * Set the icon for the toast.
   *
   * @param iconName Icon name
   */
  setIconName(iconName: IconName): void;

  /**
   * Set the message for the toast.
   *
   * @param message Message
   */
  setMessage(message: string): void;

  /**
   * Set the timeout for the toast.
   *
   * @param timeout Visibility timeout in milliseconds
   */
  setTimeout(timeout: number): void;

  /**
   * Set the toast variant.
   *
   * @param variant Variant
   */
  setVariant(variant: Variant): void;
}

const DEFAULT_VISIBILITY_TIMEOUT = 2000;

const toastConfigAtom = atom<ActivityToastConfig>({
  iconName: IconName.Check,
  message: "",
  variant: Variant.Success,
  timeout: DEFAULT_VISIBILITY_TIMEOUT,
});

/**
 * Hook which provides read and write access to the application's ActivityToast
 * through the {@link IActivityToast} interface.
 */
export const useActivityToast = (): IActivityToast => {
  const [config, setConfig] = useAtom<ActivityToastConfig>(toastConfigAtom);
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (config.message) {
      setOpen(true);
    }

    let onUnmount: () => void;

    const timeoutMs = config.timeout ?? DEFAULT_VISIBILITY_TIMEOUT;
    if (timeoutMs > 0) {
      const timeout = setTimeout(() => setOpen(false), timeoutMs);

      onUnmount = () => clearTimeout(timeout);
    }

    return onUnmount;
  }, [config]);

  return useMemo(
    () => ({
      config,
      open,
      setConfig,
      setIconName: (iconName) => setConfig((prev) => ({ ...prev, iconName })),
      setMessage: (message) => setConfig((prev) => ({ ...prev, message })),
      setTimeout: (timeout) => setConfig((prev) => ({ ...prev, timeout })),
      setVariant: (variant) => setConfig((prev) => ({ ...prev, variant })),
    }),
    [config, open, setConfig],
  );
};
