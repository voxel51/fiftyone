import { ExternalLink, Toast, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Launch } from "@mui/icons-material";
import { Button } from "@mui/material";
import React from "react";
import { useRecoilState } from "recoil";

const SNACK_VISIBLE_DURATION = 5000;

const Link = ({ link, message }: { link: string; message: string }) => {
  const theme = useTheme();
  return (
    <ExternalLink style={{ color: theme.text.primary }} href={link}>
      {message}
      <Launch style={{ height: "1rem", marginTop: 4.5, marginLeft: 1 }} />
    </ExternalLink>
  );
};

const LAYOUT = {
  bottom: "50px !important",
  vertical: "bottom",
  horizontal: "center",
};

const Dismiss = ({ onClick }: { onClick: () => void }) => {
  const theme = useTheme();
  return (
    <div>
      <Button
        data-cy="btn-dismiss-alert"
        variant="contained"
        size="small"
        onClick={() => {
          onClick();
        }}
        sx={{
          marginLeft: "auto",
          backgroundColor: theme.primary.main,
          color: theme.text.primary,
          boxShadow: 0,
        }}
      >
        Dismiss
      </Button>
    </div>
  );
};

function SnackbarErrors() {
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);

  return snackErrors.length ? (
    <Toast
      duration={SNACK_VISIBLE_DURATION}
      layout={LAYOUT}
      message={<div style={{ width: "100%" }}>{snackErrors}</div>}
      onHandleClose={() => setSnackErrors([])}
      primary={() => {
        return <Dismiss onClick={() => setSnackErrors([])} />;
      }}
    />
  ) : null;
}

function SnackbarLinks() {
  const [snackLink, setSnackLink] = useRecoilState(fos.snackbarLink);

  return snackLink ? (
    <Toast
      duration={SNACK_VISIBLE_DURATION}
      layout={LAYOUT}
      message={
        <div style={{ width: "100%" }}>
          <Link {...snackLink} />
        </div>
      }
      onHandleClose={() => setSnackLink(null)}
      primary={() => {
        return <Dismiss onClick={() => setSnackLink(null)} />;
      }}
    />
  ) : null;
}

export default function Snackbar() {
  return (
    <>
      <SnackbarErrors />
      <SnackbarLinks />
    </>
  );
}
