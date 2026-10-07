/**
 * It NextJS environments, or perhaps some webpack environments generally,
 * graphql calls are resolved as modules and the default must be accessed.
 *
 * @benjaminpkane not fully understood
 */
export default <T>(module: T): T => {
  const resolved = (module as { default?: T }).default;
  if (resolved) {
    return resolved;
  }

  return module;
};
