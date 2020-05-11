import io from "socket.io-client";
import { useEffect } from "react";

const sockets = {};

export function getSocket(server, name) {
  console.log("http://127.0.0.1:" + server + "/" + name);
  if (!sockets[name]) {
    sockets[name] = io.connect("http://127.0.0.1:" + server + "/" + name);
  }
  return sockets[name];
}

export function useSubscribe(socket, event, callback) {
  useEffect(() => {
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []);
}
