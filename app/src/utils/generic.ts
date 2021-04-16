export const isElectron = (): boolean => {
  return (
    window.process &&
    window.process.versions &&
    Boolean(window.process.versions.electron)
  );
};

export const isFloat = (n: number): boolean => {
  return Number(n) === n && n % 1 !== 0;
};
