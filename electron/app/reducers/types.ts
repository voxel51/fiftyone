import { Dispatch as ReduxDispatch, Store as ReduxStore, Action } from "redux";

export type updateStateType = {
  state: object;
  port: number;
  colors: Array;
};

export type GetState = () => updateStateType;

export type Dispatch = ReduxDispatch<Action<string>>;

export type Store = ReduxStore<stateType, Action<string>>;
