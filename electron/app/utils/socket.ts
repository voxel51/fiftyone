import io from "socket.io-client";
import { useEffect } from "react";

const sockets = {};

export function getSocket(server, name) {
  if (!sockets[server]) {
    sockets[server] = {};
  }
  if (!sockets[server][name]) {
    sockets[server][name] = io.connect(
      "http://127.0.0.1:" + server + "/" + name
    );
  }
  return sockets[server][name];
}

export function useSubscribe(socket, event, callback) {
  useEffect(() => {
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []);
}
