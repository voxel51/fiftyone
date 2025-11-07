export type EventFamily = Record<string, any>;

export type EventHandler<T> = (event: T) => void;
