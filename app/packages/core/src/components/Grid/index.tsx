export { default } from "./Grid";
export { gridZoom } from "./recoil";
export { ZOOM_RANGE } from "./useZoomSetting";

export default function Grid() {
  return (
    <Container>
      <Grid key={"grid"} />
      <ContainerHeader key={"header"} />
    </Container>
  );
}
