/** One render-ready 2D image frame for a transport-agnostic archetype. */
export type Image2dFrame = {
  id: string;
  src: string;
  timestampNs: number;
};

/** Visual props for the transport-agnostic `image2d` archetype. */
export type Image2dViewProps = {
  frame: Image2dFrame | null;
  alt?: string;
  objectFit?: "contain" | "cover";
};
