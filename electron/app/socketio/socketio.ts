import io from "socket.io-client";
import { update } from "../actions/update";

export default function initSocket() {
  const socket = io("http://127.0.0.1:5151/state");

  socket.on("connect", () => console.log("connected"));

  socket.on("disconnect", () => console.log("disconnected"));

  socket.on("update", (data) => {
    console.log(data);
    update(data);
  });
  return socket;
}
