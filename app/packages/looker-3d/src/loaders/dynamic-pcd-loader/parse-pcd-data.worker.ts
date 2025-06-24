import { parsePCDData } from "./parse-pcd-data";

self.onmessage = async (event) => {
  try {
    const { data, littleEndian } = event.data;
    const result = parsePCDData(data, littleEndian);

    const buffers = [];
    const transferables = [];
    const bufferDestructurables = [];

    /**
     * note: we need to go through all attributes (and position),
     * create Float32Arrays, and transfer them to the main thread.
     *
     * otherwise, naively copying Number[] uses structuredClone
     *
     * todo: use smaller typed arrays depending on the data type,
     * although Float32Array is fine for now, because we actually save in memory
     * since Number[] under the hood is Float64Array anyway
     */

    if (result.position.length) {
      // note: some loss in precision here, but webgl doesn't support Float64, so it's fine
      const positionArrRaw = new Float32Array(result.position);
      buffers.push(positionArrRaw);
      transferables.push(positionArrRaw.buffer);
      bufferDestructurables.push("position");
    }

    for (const [key, arr] of Object.entries(result.attributes)) {
      // note: some loss in precision here, but webgl doesn't support Float64, so it's fine
      const arrRaw = new Float32Array(arr);
      buffers.push(arrRaw);
      transferables.push(arrRaw.buffer);
      bufferDestructurables.push(key);
    }

    self.postMessage(
      { bufferDestructurables, buffers, header: result.header },
      // @ts-ignore: self is WorkerGlobalScope
      transferables
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
