import React, { Suspense } from "react";
import styled from "styled-components";
import LoadingDots from "../../../../components/src/components/Loading/LoadingDots";

const Container = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  text-overflow: ellipsis;
`;

const Body = styled.div`
  cursor: default;
  position: relative;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.5rem;
  position: relative;
`;

export const LoadingContainer = ({ path }: { path?: string; text: string }) => {
  return (
    <Container>
      {path && <Header>{path.split(".").slice(-1)[0]}</Header>}
      <Body>
        <LoadingDots text={"Loading"} />
      </Body>
    </Container>
  );
};

const withSuspense = <T extends { path: string; named: boolean }>(
  Component: React.FC<T>
) => {
  return (props: T) => {
    return (
      <Suspense
        fallback={
          <LoadingContainer path={props.named ? props.path : undefined} />
        }
      >
        <Component {...props} />
      </Suspense>
    );
  };
};

export default withSuspense;
