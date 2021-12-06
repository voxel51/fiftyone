import React from "react";

import RegularEntry from "./RegularEntry";

const TagValueEntry = ({ tag }: { tag: string }) => {
  return <RegularEntry title={tag} heading={tag} />;
};

export default React.memo(TagValueEntry);
