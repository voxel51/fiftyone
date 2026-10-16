/** Sent as a fetched range of frames lands in the store of controller `id` */
export const IMAVID_FETCHED_EVENT = "imavid:fetched";

export type ImaVidEvents = { [IMAVID_FETCHED_EVENT]: { id: string } };
