import { deserialize } from "./numpy";
import type { InlineDecodeable, OverlayMask } from "./types";

export default (inline: InlineDecodeable): OverlayMask | null => {
  let base64: string;
  if (typeof inline === "string") {
    base64 = inline;
  } else if (typeof inline?.$binary?.base64 === "string") {
    base64 = inline.$binary.base64;
  }

  if (!base64) {
    return null;
  }

  return deserialize(base64);
};
