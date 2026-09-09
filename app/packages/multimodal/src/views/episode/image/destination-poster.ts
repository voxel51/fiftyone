export interface DestinationPosterIdentity {
  readonly committedSourceKey: string | null;
  readonly committedStream: string | null;
  readonly dataStreamSourceKey: string;
  readonly posterSourceKey: string;
  readonly posterStreamId: string | null;
  readonly stream: string;
}

/**
 * Shows a source-authenticated bootstrap poster until this tile commits its
 * first real frame for the destination source and stream.
 */
export function shouldPresentDestinationPoster({
  committedSourceKey,
  committedStream,
  dataStreamSourceKey,
  posterSourceKey,
  posterStreamId,
  stream,
}: DestinationPosterIdentity): boolean {
  if (posterStreamId !== stream) return false;
  if (dataStreamSourceKey && dataStreamSourceKey !== posterSourceKey) {
    return false;
  }

  return committedSourceKey !== posterSourceKey || committedStream !== stream;
}
