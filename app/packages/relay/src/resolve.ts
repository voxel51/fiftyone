export default <T extends unknown>(module: T): T => {
  // @ts-ignore
  if (module.default) {
    // @ts-ignore
    return module.default;
  }

  return module;
};
