import { RegisteredWriter } from "./registerWriter";

const onSetSelectedFields: RegisteredWriter<"selectedFields"> =
  ({ router }) =>
  (selectedFields) => {
    router.history.replace(
      `${router.history.location.pathname}${router.history.location.search}`,
      {
        ...router.get().state,
        extendedStages: selectedFields ? [selectedFields] : [],
      }
    );
  };

export default onSetSelectedFields;
