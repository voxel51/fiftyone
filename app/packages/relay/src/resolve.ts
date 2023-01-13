/**
 * It NextJS environments, or perhaps some webpack environments generally,
 * graphql calls are resolved as modules and the default must be accessed.
 *
 * @benjaminpkane not fully understood
 */
export default <T extends unknown>(module: T): T => {
  // @ts-ignore
  if (module.default) {
    // @ts-ignore
    return module.default;
  }

  return module;
};
