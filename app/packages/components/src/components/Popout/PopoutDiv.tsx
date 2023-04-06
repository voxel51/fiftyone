import { animated } from "@react-spring/web";
import styled from "styled-components";

const PopoutDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.custom.shadow};
  box-sizing: border-box;
  margin-top: 0.6rem;
  position: absolute;
  width: auto;
  z-index: 801;
  font-size: 14px;
  padding: 0 0.5rem 0 0.5rem;
  min-width: 14rem;
`);

export default PopoutDiv;
