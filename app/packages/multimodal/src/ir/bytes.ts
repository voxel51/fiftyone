/** Stable source-profile values shared across transport-neutral layers. */
export const BYTE_SOURCE_READ_PROFILE = Object.freeze({
  LOCAL: "local",
  REMOTE: "remote",
} as const);

/** Source-locality hint used by byte resources to choose cache behavior. */
export type ByteSourceReadProfile =
  (typeof BYTE_SOURCE_READ_PROFILE)[keyof typeof BYTE_SOURCE_READ_PROFILE];

/** Cloneable byte-source identity resolved from one episode asset. */
export interface ByteSourceDescriptor {
  /**
   * Identity of the bytes themselves, where `sourceId` identifies one
   * consumer's view of them. Two sources that share a `contentId` are the
   * same object, so anything cached for one is valid for the other.
   */
  readonly contentId?: string;
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
