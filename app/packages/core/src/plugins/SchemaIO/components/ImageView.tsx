import React from "react";
import { Box } from "@mui/material";
import Header from "./Header";

// function toBase64(file) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.readAsDataURL(file);
//     reader.onload = () => resolve(reader.result);
//     reader.onerror = (error) => reject(error);
//   });
// }
export default function ImageView(props) {
  const { view, src } = props;
  return (
    <Box>
      <Header {...view} />
      <img src={src} />
    </Box>
  );
}
