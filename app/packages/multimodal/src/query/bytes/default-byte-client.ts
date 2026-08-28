import { createHttpByteClient } from "./http-byte-client";
import { createLocalFileByteClient } from "./local-file-byte-client";
import type { ByteClient } from "./types";

/**
 * Creates the default browser byte reader. Local File-backed sources are read
 * from Blob slices; all other sources use HTTP range requests.
 */
export function createDefaultByteClient(): ByteClient {
  const fileClient = createLocalFileByteClient();
  const httpClient = createHttpByteClient();

  return {
    async stat(source, signal) {
      return source.localFile
        ? fileClient.stat?.(source, signal)
        : httpClient.stat?.(source, signal);
    },

    async readBytes(request) {
      return request.source.localFile
        ? fileClient.readBytes(request)
        : httpClient.readBytes(request);
    },
  };
}
