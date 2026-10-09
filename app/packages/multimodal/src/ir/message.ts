/** Full-fidelity, structured-cloneable message values for full-message reads. */
export type MessageValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | bigint
  | Uint8Array
  | readonly MessageValue[]
  | { readonly [key: string]: MessageValue };
