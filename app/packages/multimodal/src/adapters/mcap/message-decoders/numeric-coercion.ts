/** Numeric coercion accepted by Foxglove protobuf field readers. */
export const FOXGLOVE_PROTOBUF_NUMBER_COERCION_POLICY =
  "number-or-bigint" as const;

/** Numeric coercion accepted by ROS field readers. */
export const ROS_NUMBER_COERCION_POLICY = "number-bigint-or-long-like" as const;

/** Wire-family policy for converting decoded numeric values to numbers. */
export type DecodedNumberCoercionPolicy =
  | typeof FOXGLOVE_PROTOBUF_NUMBER_COERCION_POLICY
  | typeof ROS_NUMBER_COERCION_POLICY;

/**
 * Coerces a decoded numeric value according to its wire family's policy.
 */
export function coerceDecodedNumber(
  value: unknown,
  policy: DecodedNumberCoercionPolicy,
): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (
    policy === ROS_NUMBER_COERCION_POLICY &&
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    const converted: unknown = value.toNumber();
    return typeof converted === "number" ? converted : undefined;
  }

  return undefined;
}
