import React from "react";

const SearchResult = React.memo(({ name, setResult }) => {
  return <div onClick={setResult(name)}>{name}</div>;
});

export default ({ results, setResult }) => {
  return (
    <div>
      {results.map((result) => {
        <SearchResult name={result.name} setResult={setResult} />;
      })}
    </div>
  );
};
