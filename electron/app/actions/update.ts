import { GetState, Dispatch } from "../reducers/types";

export const UPDATE = "UPDATE";

export function update(data) {
  return {
    type: UPDATE,
    data: data,
  };
}

export function updateState(data) {
  return (dispatch) => {
    return dispatch(update(data));
  };
}
