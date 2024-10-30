interface DebouncedNavigatorOptions {
  isNavigationIllegalWhen: () => boolean;
  navigateFn: (offset: number) => Promise<void>;
  onNavigationStart: () => void;
  debounceTime?: number;
}

export function createDebouncedNavigator({
  isNavigationIllegalWhen,
  navigateFn,
  onNavigationStart,
  debounceTime = 100,
}: DebouncedNavigatorOptions) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let accumulatedOffset = 0;
  let isFirstCall = true;

  const cleanup = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    accumulatedOffset = 0;
    isFirstCall = true;
  };

  const navigate = () => {
    if (isNavigationIllegalWhen()) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      // Reset state variables
      isFirstCall = true;
      accumulatedOffset = 0;
      return;
    }

    if (isFirstCall) {
      // first invocation: navigate immediately
      onNavigationStart();
      navigateFn(1);
      accumulatedOffset = 0;
      isFirstCall = false;
    } else {
      // subsequently, accumulate offset
      accumulatedOffset += 1;
    }

    // reset debounce timer
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      if (accumulatedOffset > 0) {
        onNavigationStart();
        navigateFn(accumulatedOffset);
        accumulatedOffset = 0;
      }
      timeout = null;
      isFirstCall = true;
    }, debounceTime);
  };

  return {
    navigate,
    cleanup,
  };
}
