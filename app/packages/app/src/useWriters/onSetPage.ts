import { RegisteredWriter } from "./registerWriter";

const onSetPage: RegisteredWriter<"sessionPage"> =
  ({ environment, subscription, router }) =>
  (page) => {
    const search = new URLSearchParams(router.history.location.search);
    if (!page) {
      search.delete("page");
    } else {
      search.set("page", page.toString());
    }

    let string = search.toString();

    if (string.length) {
      string = "?" + string;
    }

    const pathname = router.history.location.pathname + string;

    router.history.replace(pathname, router.history.location.state);
  };

export default onSetPage;
