import { RegisteredSetter } from "./registerSetter";

const onRefresh: RegisteredSetter =
  ({ router }) =>
  () => {
    router.load(true);
  };

export default onRefresh;
