import io from "socket.io-client";
import { useEffect } from "react";
import { getPageUrl } from "../../test/e2e/helpers";

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

export function getPage(socket, page) {
  return new Promise(function (resolve) {
    socket.emit("page", page, resolve);
  });
}

export function useSubscribe(socket, event, callback) {
  useEffect(() => {
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []);
}
