import styled from "styled-components";

const ErrorContainer = styled.div`
  display: flex;
  padding: 16px;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 12px;
  align-self: stretch;
  max-height: 300px;

  border-radius: 4px;

  /* Shadow/xs */
  box-shadow: 0 1px 2px 0 rgba(16, 24, 40, 0.05);
`;

const ErrorBox = ({ error }: { error: string }) => {
  return <ErrorContainer>{error}</ErrorContainer>;
};

export default ErrorBox;
