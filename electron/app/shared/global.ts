import { createGlobalStyle, css } from "styled-components";
import { color, typography } from "./styles";

export const styles = css`
  body,
  input {
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    font-weight: bold;
    margin: 0 !important;
    padding: 0 !important;
  }

  #root {
    overflow: hidden;
  }
`;

export const GlobalStyle = createGlobalStyle`
   ${styles}
`;
