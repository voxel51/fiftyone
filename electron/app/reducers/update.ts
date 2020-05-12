import { Action } from "redux";
import { UPDATE, PORT } from "../actions/update";
import io from "socket.io-client";

export default function state(
  state = { port: 5151, connected: false },
  action
) {
  switch (action.type) {
    case UPDATE:
      return { ...state, state: action.data };
    case PORT:
      return { ...state, port: action.data };
    default:
      return state;
  }
}
