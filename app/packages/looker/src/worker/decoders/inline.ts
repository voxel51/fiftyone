import { deserialize } from "./numpy";
import type { InlineDecodeable, IntermediateMask } from "./types";

export default (inline: InlineDecodeable): IntermediateMask | null => {
  let base64: string;
  if (typeof inline === "string") {
    base64 = inline;
  } else if (typeof inline?.$binary?.base64 === "string") {
    base64 = inline.$binary.base64;
  }

  if (!base64) {
    return null;
  }

  const data = deserialize(base64);
  const [height, width] = data.shape;

  return {
    data,
    image: new ArrayBuffer(width * height * 4),
  };
};
