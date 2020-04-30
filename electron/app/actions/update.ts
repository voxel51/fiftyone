import { GetState, Dispatch } from "../reducers/types";

export const UPDATE = "UPDATE";

export function update() {
  return {
    type: UPDATE,
  };
}
