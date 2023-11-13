export default function () {
  const handleReset = useRecoilCallback(({ snapshot }) => async () => {
    setSelected([]);
    excluded && setExcluded(false);
    isFilterMode && setIsMatching(!nestedField);
  });

  return (
    <Button
      text={"Reset"}
      color={color}
      onClick={handleReset}
      style={{
        margin: "0.25rem -0.5rem",
        height: "2rem",
        borderRadius: 0,
        textAlign: "center",
      }}
    />
  );
}
