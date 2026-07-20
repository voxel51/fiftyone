/** Source-locality hint used by byte resources to choose cache behavior. */
export type ByteSourceReadProfile = "local" | "remote";

/** Cloneable byte-source identity resolved from one episode asset. */
export interface ByteSourceDescriptor {
  readonly etag?: string;
  readonly localFile?: File;
  readonly readProfile?: ByteSourceReadProfile;
  readonly sizeBytes?: string;
  readonly sourceId: string;
  readonly url: string;
}

/** Half-open byte range used by transport resources. */
export interface ByteRange {
  readonly length: bigint;
  readonly offset: bigint;
}
