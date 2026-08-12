/** Focused mp4box surface used by the LeRobot adapter. */
declare module "mp4box" {
  export interface Sample {
    cts: number;
    data?: Uint8Array;
    duration: number;
    is_sync: boolean;
    number: number;
    timescale: number;
  }

  export interface Track {
    codec: string;
    id: number;
    nb_samples: number;
    timescale: number;
    track_height: number;
    track_width: number;
  }

  export interface Movie {
    videoTracks: Track[];
  }

  export interface ISOFile {
    appendBuffer(data: MP4BoxBuffer, last?: boolean): number;
    flush(): void;
    onError?: (error: string) => void;
    onReady?: (info: Movie) => void;
    onSamples?: (id: number, user: unknown, samples: Sample[]) => void;
    setExtractionOptions(
      id: number,
      user?: unknown,
      options?: { nbSamples?: number },
    ): void;
    start(): void;
    stop(): void;
  }

  export function createFile(keepMdatData?: boolean): ISOFile;

  export class MP4BoxBuffer extends ArrayBuffer {
    fileStart: number;
    static fromArrayBuffer(
      buffer: ArrayBufferLike,
      fileStart: number,
    ): MP4BoxBuffer;
  }
}
