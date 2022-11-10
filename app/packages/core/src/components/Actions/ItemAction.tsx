import { animated } from "@react-spring/web";
import styled from "styled-components";

export const ItemAction = animated(styled.div`
  cursor: pointer;
  margin: 0 -0.5rem;
  padding: 0.25rem 0.5rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  text-decoration: none;
  color: ${({ theme }) => theme.text.secondary};
`);
