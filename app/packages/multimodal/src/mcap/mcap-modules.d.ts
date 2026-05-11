declare module "@mcap/core" {
  /**
   * MCAP random-access readable source.
   */
  export interface IReadable {
    read(offset: bigint, size: bigint): Promise<Uint8Array>;

    size(): Promise<bigint>;
  }

  /**
   * MCAP decompression handlers keyed by compression name.
   */
  export type DecompressHandlers = Readonly<
    Record<string, (buffer: Uint8Array, decompressedSize: bigint) => Uint8Array>
  >;

  /**
   * Typed MCAP record shapes used by the multimodal adapter.
   */
  export type TypedMcapRecords = {
    Channel: {
      readonly id: number;
      readonly messageEncoding: string;
      readonly metadata: ReadonlyMap<string, string>;
      readonly schemaId: number;
      readonly topic: string;
      readonly type: "Channel";
    };
    Message: {
      readonly channelId: number;
      readonly data: Uint8Array;
      readonly logTime: bigint;
      readonly publishTime: bigint;
      readonly sequence: number;
      readonly type: "Message";
    };
    Schema: {
      readonly data: Uint8Array;
      readonly encoding: string;
      readonly id: number;
      readonly name: string;
      readonly type: "Schema";
    };
  };

  /**
   * Indexed MCAP reader from `@mcap/core`.
   */
  export class McapIndexedReader {
    readonly channelsById: ReadonlyMap<number, TypedMcapRecords["Channel"]>;
    readonly schemasById: ReadonlyMap<number, TypedMcapRecords["Schema"]>;

    static Initialize(options: {
      readonly decompressHandlers?: DecompressHandlers;
      readonly messageIndexCacheSizeBytes?: number;
      readonly readable: IReadable;
    }): Promise<McapIndexedReader>;

    readMessages(args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }): AsyncGenerator<TypedMcapRecords["Message"], void, void>;
  }
}

declare module "@mcap/support" {
  import type { DecompressHandlers } from "@mcap/core";

  /**
   * Loads MCAP decompression handlers for known compression formats.
   */
  export function loadDecompressHandlers(): Promise<DecompressHandlers>;
}
