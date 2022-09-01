import React, { useState } from "react";
import logo from "./logo.svg";

import { Looker3d } from "./Looker3d";

function App() {
  const [count, setCount] = useState(0);

  return <Looker3d filePrefix="/" />;
}

export default App;
