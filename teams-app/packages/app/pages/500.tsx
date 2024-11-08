import { mainTitleSelector } from "@fiftyone/teams-state";
import { CONTACT_LINK } from "@fiftyone/teams-state/src/constants";
import SupportOutlinedIcon from "@mui/icons-material/SupportOutlined";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import Image from "next/image";
import { useEffect } from "react";
import { useSetRecoilState } from "recoil";

// This file is statically generated at build time.
/*
 * Note: You can use getStaticProps inside this page
 * if you need to fetch data at build time.
 */
function Custom500() {
  const setPageTitle = useSetRecoilState(mainTitleSelector);

  useEffect(() => {
    setPageTitle("Something went wrong");
  }, []);

  return (
    <Grid
      sx={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
      }}
      width="100%"
      height="70vh"
    >
      <Grid item xs={4}>
        <Box pt={1}>
          <Typography variant="h6">
            Oops, something went wrong. Please try again.
          </Typography>
        </Box>
        <Box pt={1.5}>
          <Typography variant="body1">
            If you keep having trouble, please contact support.
          </Typography>
        </Box>
        <Box pt={2}>
          <a href={CONTACT_LINK}>
            <Box display="flex" pt={1} color="text.secondary">
              <SupportOutlinedIcon />
              <Typography variant="body1" pl={1}>
                Contact support
              </Typography>
            </Box>
          </a>
        </Box>
      </Grid>
      <Grid item xs={1} />
      <Grid item xs={4}>
        <Image src="/error.svg" height={402} width={296} />
      </Grid>
    </Grid>
  );
}

export default Custom500;
