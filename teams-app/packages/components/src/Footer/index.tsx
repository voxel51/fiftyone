import { Box, Grid, Link, Typography, LinkProps } from '@mui/material';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import React from 'react';
import { CONSTANT_VARIABLES, useFooter } from '@fiftyone/teams-state';
import { useProductVersion } from '@fiftyone/hooks';

const {
  CONTACT_LINK,
  DOCUMENTATION_LINK,
  GITHUB_LINK,
  PRIVACY_POLICY_LINK,
  SLACK_LINK,
  TERMS_OF_SERVICE_LINK,
  COMPANY_NAME
} = CONSTANT_VARIABLES;

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const version = useProductVersion();

  return (
    <Grid
      container
      direction="column"
      alignItems="center"
      borderTop={(theme) => `1px solid ${theme.palette.divider}`}
      paddingTop={4}
      marginTop={4}
    >
      <Grid paddingBottom={2}>
        <FooterLink href={DOCUMENTATION_LINK}>Docs</FooterLink>
        <FooterLink href={CONTACT_LINK}>Support</FooterLink>
        <FooterLink href={SLACK_LINK} external>
          Slack
        </FooterLink>
        <FooterLink href={GITHUB_LINK} external>
          GitHub
        </FooterLink>
        {/* <FooterLink href="#">Give feedback</FooterLink> */}
      </Grid>
      <Grid paddingBottom={2}>
        <Typography variant="body1" color="text.tertiary">
          Version {version}
        </Typography>
      </Grid>
      <Grid paddingBottom={2}>
        <FooterLink href={TERMS_OF_SERVICE_LINK}>Terms</FooterLink>
        <FooterLink href={PRIVACY_POLICY_LINK}>Privacy</FooterLink>
        <Typography
          component="span"
          variant="body1"
          paddingLeft={1}
          color="text.tertiary"
        >
          © {currentYear} {COMPANY_NAME}
        </Typography>
      </Grid>
    </Grid>
  );
}

function FooterLink(props: FooterLinkProps) {
  const { external, children, ...linkProps } = props;
  return (
    <Box display="inline" paddingX={1}>
      <Link variant="body1" color="text.secondary" {...linkProps}>
        {children}
      </Link>
      {external && (
        <ArrowOutwardIcon
          sx={{
            verticalAlign: 'middle',
            color: (theme) => theme.palette.text.secondary
          }}
        />
      )}
    </Box>
  );
}

type FooterLinkProps = LinkProps & {
  external?: boolean;
};
