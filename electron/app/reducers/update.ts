import { Action } from "redux";
import { UPDATE } from "../actions/update";
import io from "socket.io-client";

export default function state(state = {}, action) {
  switch (action.type) {
    case UPDATE:
      if (!state.socket) {
        return {
          ...state,
          state: action.data,
          socket: io.connect("http://localhost:5151/state"),
        };
      }
      return { ...state, state: action.data };
    default:
      if (!state.socket) {
        return {
          ...state,
          state: action.data,
          socket: io.connect("http://localhost:5151/state"),
        };
      }
      return state;
  }
}
