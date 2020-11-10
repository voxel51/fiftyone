export const attachDisposableHandler = (socket, type, handler) => {
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
