import { Typography, Box } from "@mui/material";
import { CodeBlock } from "@fiftyone/components";

export default function ErrorWithStack({ error }) {
  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        padding: 2,
        paddingTop: 8
      }}
    >
      {error.message && (<Typography variant="h6" gutterBottom>
        {error.message}
      </Typography>)}
      {error.details && (
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          {error.details}
        </Typography>
      )}
      {error.stack && (
        <Box sx={{ width: "100%" }}>
          <CodeBlock
            text={error.stack.trim().replace(/\n+/g, "\n")}
            language="javascript"
          />
        </Box>
      )}
    </Box>
  );
}
