import React from "react";
import styled from "styled-components";
import FilterContent from "../../Sidebar/Entries/FilterablePathEntry/Container";

const Container = styled.div`
  margin: 3px;
  font-weight: bold;
`;

/** The shared frame for categorical values, with an optional field heading. */
export default function CategoricalFilterContainer({
  path,
  heading,
  children,
}: React.PropsWithChildren<{ path: string; heading?: React.ReactNode }>) {
  return (
    <Container
      data-cy={`categorical-filter-${path}`}
      onClick={(event) => event.stopPropagation()}
    >
      {heading}
      <FilterContent onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </FilterContent>
    </Container>
  );
}
