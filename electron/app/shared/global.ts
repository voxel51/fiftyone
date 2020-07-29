import { createGlobalStyle, css } from "styled-components";
import { color, typography } from "./styles";

export const styles = css`
  body,
  input,
  button {
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    font-weight: bold;
  }

  body,
  html {
    height: 100%;
    margin: 0 !important;
    padding: 0 !important;
  }

  input {
    padding: 0;
  }

  #root {
    height: 100%;
    position: relative;
    overflow: hidden;
  }
`;

export const GlobalStyle = createGlobalStyle`
   ${styles}
`;
