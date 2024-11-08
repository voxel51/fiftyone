import { Box, Container, SectionHeader } from "@fiftyone/teams-components";
import { Grid, Typography } from "@mui/material";
import { SettingsGroupProps } from "../config/types";

export default function SettingsGroup(props: SettingsGroupProps) {
  const { title, description, settings, onChange, ...boxProps } = props;
  return (
    <Box {...boxProps}>
      <SectionHeader title={title} description={description} />
      <Container>
        {settings.map(({ id, label, value, updating, Component, caption }) => (
          <Grid key={id} container sx={{ pt: 2 }}>
            <Grid item xs={4}>
              <Typography color="text.primary" fontWeight={350}>
                {label}
              </Typography>
            </Grid>
            <Grid item xs={8}>
              <Component
                onChange={(value) => onChange(id, value)}
                value={value}
                updating={updating}
              />
              {caption && (
                <Typography
                  sx={{ pt: 0.5, pl: 0.25 }}
                  variant="caption"
                  color="text.tertiary"
                >
                  {caption}
                </Typography>
              )}
            </Grid>
          </Grid>
        ))}
      </Container>
    </Box>
  );
}
