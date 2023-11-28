import { LoadingDots } from "@fiftyone/components";
import React, { useEffect, useState } from "react";
import Container from "./Container";

export default function () {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setShow(true), 300);

    return () => {
      clearTimeout(timeout);
      setShow(false);
    };
  }, []);

  if (!show) {
    return null;
  }
  return (
    <Container>
      <LoadingDots text="Loading" />
    </Container>
  );
}
