import {
  Grid,
  Typography,
  Link,
  Divider,
  Box,
  SxProps,
  Theme,
  BoxProps
} from '@mui/material';
import React from 'react';

type SubHeaderProps = {
  title: string | JSX.Element;
  description?: string | JSX.Element;
  learnMoreLink?: string;
  learnMoreText?: string;
  children?: JSX.Element;
  sx?: SxProps<Theme>;
  content?: JSX.Element;
  containerProps?: BoxProps;
};

const SectionHeader = (props: SubHeaderProps) => {
  const {
    title,
    description,
    children,
    learnMoreLink,
    learnMoreText = 'Learn more',
    sx = {},
    content,
    containerProps
  } = props;
  return (
    <Box sx={{ pb: 2, ...(containerProps?.sx || {}) }} {...containerProps}>
      <Grid
        container
        sx={{ justifyContent: 'space-between', alignItems: 'center', ...sx }}
        spacing={2}
      >
        <Grid item xs sx={{ width: '100%', overflow: 'hidden' }}>
          <Typography variant="h6" component="h6" noWrap data-testid="title">
            {title}
          </Typography>
          {content}
          {description && (
            <Box display="flex" alignItems="center">
              <Typography variant="body1" noWrap>
                <Typography variant="body1" noWrap data-testid="description">
                  {description}{' '}
                </Typography>
                {learnMoreLink && (
                  <>
                    <Link
                      href={learnMoreLink}
                      target="_blank"
                      data-testid="learn-more"
                    >
                      {learnMoreText}
                    </Link>
                    .
                  </>
                )}
              </Typography>
            </Box>
          )}
        </Grid>
        {children && (
          <Grid
            item
            md={4}
            xs={12}
            sx={{
              display: 'flex',
              justifyContent: { xs: 'flex-start', md: 'flex-end' }
            }}
          >
            {children}
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default SectionHeader;
