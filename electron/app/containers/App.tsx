import React, { ReactNode } from "react";
import Sidebar from "../components/Sidebar";

type Props = {
  children: ReactNode;
};

export default function App(props: Props) {
  const { children } = props;
  return (
    <>
      <Sidebar />
      <div style={{ marginLeft: 260 }}>{children}</div>
    </>
  );
}
