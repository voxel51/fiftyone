import { Link } from "@mui/material";
import styled, { useTheme } from "styled-components";
import ComputeVisualizationButton from "./ComputeVisualizationButton";
export default function EmptyEmbeddings() {
  const theme = useTheme();
  return (
    <NotFound style={{ textAlign: "center" }}>
      <h3>No embeddings visualizations found.</h3>
      <ComputeVisualizationButton />
      <p>
        <Link
          style={{ color: theme.text.primary }}
          href="https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
        >
          Learn more
        </Link>{" "}
        about using this feature.
      </p>
    </NotFound>
  );
}
const NotFound = styled.div`
  text-align: center;
`;
