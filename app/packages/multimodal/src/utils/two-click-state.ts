export interface TwoClickState<Point> {
  readonly a: Point;
  readonly b: Point | null;
}

/** Advances an anchor/finish/reset two-click interaction. */
export function nextTwoClickState<Point>(
  current: TwoClickState<Point> | null,
  pick: Point,
): TwoClickState<Point> {
  if (!current || current.b !== null) {
    return { a: pick, b: null };
  }
  return { a: current.a, b: pick };
}
