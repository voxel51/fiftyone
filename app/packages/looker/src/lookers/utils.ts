import type { Buffers } from "../state";

export const hasFrame = (buffers: Buffers, frameNumber: number) => {
  return buffers.some(
    ([start, end]) => start <= frameNumber && frameNumber <= end
  );
};
