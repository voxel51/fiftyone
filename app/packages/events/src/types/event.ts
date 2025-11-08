export type EventGroup = Record<string, any>;

export type EventHandler<T> = (event: T) => void;
