import { RegisteredSetter } from "./registerSetter";

const onSetRefreshPage: RegisteredSetter =
  ({ router }) =>
  () => {
    router.load(true);
  };

export default onSetRefreshPage;
