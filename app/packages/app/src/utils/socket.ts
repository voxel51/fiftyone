import socket from "../shared/connection";

export const attachDisposableHandler = (type, handler) => {
  const wrapper = ({ data }) => {
    data = JSON.parse(data);
    if (data.type === type) {
      handler(data);
      socket.removeEventListener("message", wrapper);
    }
  };
  socket.addEventListener("message", wrapper);
};

export const packageMessage = (type, data) => {
  return JSON.stringify({
    ...data,
    type,
  });
};

const requestWrapper = (type, handler) => ({ data }) => {
  data = JSON.parse(data);
  data.type === type && handler(data);
};

export const request = ({
  type,
  args,
  uuid,
  responseType,
}: {
  type: string;
  uuid: string;
  args: any;
  responseType?: string;
}) => {
  const promise = new Promise((resolve) => {
    const listener = requestWrapper(
      responseType || type,
      ({ uuid: responseUuid, ...data }) => {
        if (uuid === responseUuid) {
          socket.removeEventListener("message", listener);
          resolve(data);
        }
      }
    );
    socket.addEventListener("message", listener);
    socket.send(packageMessage(type, { ...args, uuid }));
  });

  return promise;
};
