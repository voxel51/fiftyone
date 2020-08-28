import { Action } from "redux";
import { UPDATE, PORT, CONNECTED, LOADING } from "../actions/update";
import io from "socket.io-client";

export default function state(
  state = {
    port: parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151,
    connected: false,
    loading: true,
  },
  action
) {
  switch (action.type) {
    case UPDATE:
      return { ...state, state: action.data };
    case PORT:
      return { ...state, port: action.data };
    case CONNECTED:
      return { ...state, connected: action.data };
    case LOADING:
      return { ...state, loading: action.data };
    default:
      return state;
  }
}
