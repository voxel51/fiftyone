/** Returns the smaller of two bigint values. */
export function minBigIntPair(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

/** Returns the larger of two bigint values. */
export function maxBigIntPair(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

/** Returns the smallest bigint value, failing on empty input. */
export function minBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("Expected at least one bigint value");
  }

  let minimum = values[0];
  for (let index = 1; index < values.length; index += 1) {
    minimum = minBigIntPair(minimum, values[index]);
  }
  return minimum;
}

/** Returns the largest bigint value, failing on empty input. */
export function maxBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("Expected at least one bigint value");
  }

  let maximum = values[0];
  for (let index = 1; index < values.length; index += 1) {
    maximum = maxBigIntPair(maximum, values[index]);
  }
  return maximum;
}

/** Returns the first index whose bigint value is at least `target`. */
export function lowerBoundBigInt(
  values: readonly bigint[],
  target: bigint,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
