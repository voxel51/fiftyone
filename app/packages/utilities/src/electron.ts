let cache = null;
export const isElectron = (): boolean => {
  if (cache === null) {
    try {
      cache = Boolean(
        window &&
          window.process &&
          window.process.versions &&
          window.process.versions.electron
      );
    } catch {
      cache = false;
    }
  }

  return cache;
};
