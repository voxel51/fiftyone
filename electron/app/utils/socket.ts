import io from "socket.io-client";
import { useEffect } from "react";

const sockets = {};

export function getSocket(port, name) {
  if (!sockets[port]) {
    sockets[port] = {};
  }
  if (!sockets[port][name]) {
    sockets[port][name] = io.connect("http://127.0.0.1:" + port + "/" + name);
  }
  return sockets[port][name];
}

export function useSubscribe(socket, event, callback) {
  useEffect(() => {
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []);
}
