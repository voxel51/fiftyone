import React, { useState } from "react";
import logo from "./logo.svg";

import { PointCloud } from "./PointCloud";

function App() {
  const [count, setCount] = useState(0);

  return <PointCloud filePrefix="/" />;
}

export default App;
