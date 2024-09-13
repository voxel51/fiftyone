/**
 * Optional
 * From `T` make a set of properties by key `K` become optional
 */
export type Optional<T extends object, K extends keyof T = keyof T> = Omit<
  T,
  K
> &
  Partial<Pick<T, K>>;
