import { createGlobalStyle, css } from "styled-components";
import { color, typography } from "./styles";
import { scrollbarStyles } from "../components/utils";

export const styles = css`
  body,
  input,
  button {
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    color: ${({ theme }) => theme.font};
  }

  body,
  html {
    height: 100%;
    margin: 0 !important;
    padding: 0 !important;
    background-color: ${({ theme }) => theme.background};
  }

  body {
    ${scrollbarStyles};
    ::-webkit-scrollbar {
      background-color: ${({ theme }) => theme.background};
    }
  }

  input {
    padding: 0;
  }

  #root {
    height: 100%;
    position: relative;
  }
`;

export const GlobalStyle = createGlobalStyle`
   ${styles}
`;
