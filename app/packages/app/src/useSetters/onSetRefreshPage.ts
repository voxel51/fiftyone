import { RegisteredSetter } from "./registerSetter";

const onSetRefreshPage: RegisteredSetter = (_, router) => () => {
  router.load(true);
};

export default onSetRefreshPage;
