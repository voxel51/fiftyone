import { createGlobalStyle, css } from "styled-components";
import { scrollbarStyles } from "../components/utils";

export const styles = css`
  :root {
    --bg: #ffffff;
    --bg-darker: #f8f8f8;
    --bg-darkest: #c0c0c0;
    --std-border-color: var(--bg-darkest);
    --std-border-width: 0.1rem;
    --std-border-radius: 0.2rem;
    --std-font-color: var(--bg-darkest);

    font-family: "Palanquin", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

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
    ${scrollbarStyles}

    min-width: 600px;
  }

  #modal {
    width: 100%;
    height: 100%;
    position: absolute;
    background-color: ${({ theme }) => theme.backgroundTransparent};
    top: 0;
    z-index: 1000;
    display: none;
  }

  #results {
    position: absolute;
    top: 0;
    left: 0;
  }

  #modal.modalon {
    display: block;
  }

  input {
    padding: 0;
  }

  #root {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    background-color: ${({ theme }) => theme.background};
  }
`;

export const GlobalStyle = createGlobalStyle`
   ${styles}
`;
