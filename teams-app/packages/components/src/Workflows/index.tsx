import { useTrackEvent } from "@fiftyone/analytics";
import { teamsGettingStartedAtom } from "@fiftyone/teams-state";
import SchoolIcon from "@mui/icons-material/School";
import {
  Box,
  Button,
  CardActionArea,
  Grid,
  Stack,
  SxProps,
} from "@mui/material";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import Dialog from "../Dialog";
import { scrollable } from "../Scrollable";

export default function Workflows() {
  const [open, setOpen] = useRecoilState(teamsGettingStartedAtom);
  const trackEvent = useTrackEvent();

  useEffect(() => {
    if (open) {
      trackEvent("view_get_started");
    }
  }, [open]);

  return (
    <Box>
      <Button
        variant="outlined"
        sx={ORANGE_OUTLINED_BUTTON_STYLE}
        onClick={() => {
          trackEvent("click_get_started");
          setOpen(true);
        }}
        startIcon={<SchoolIcon />}
      >
        Get started
      </Button>
      <Dialog
        hideActionButtons
        open={open}
        onClose={() => {
          trackEvent("close_get_started");
          setOpen(false);
        }}
        title={
          <Stack>
            <Typography
              sx={{
                fontSize: "2.5rem",
                color: (theme) => theme.palette.text.primary,
                fontWeight: "200",
              }}
              gutterBottom
            >
              Welcome to&nbsp;
              <Typography
                sx={{
                  fontWeight: "370",
                  fontSize: "inherit",
                  color: "inherit",
                }}
                component="span"
              >
                FiftyOne!
              </Typography>
            </Typography>
            <Typography>
              FiftyOne is the refinery for building visual AI. You can use it to
              explore, visualize and curate datasets together with your models.
            </Typography>
          </Stack>
        }
        fullWidth
        PaperProps={{
          sx: {
            maxWidth: "min(90vw, 850px)",
            maxHeight: "calc(100% - 32px)",
            margin: 2,
          },
        }}
      >
        <Typography sx={{ pt: 2.5, pb: 1.5 }}>
          Choose from one of our guided walkthroughs below to experience
          examples of common workflows you can do in FiftyOne:
        </Typography>
        <Grid
          container
          gap={2}
          sx={{ maxHeight: "calc(100vh - 340px)", overflow: "auto", py: 1 }}
          className={scrollable}
        >
          {WORKFLOWS.map((workflow) => (
            <Grid item xs>
              <Link href={workflow.href}>
                <CardActionArea
                  sx={{ height: "100%" }}
                  onClick={() => {
                    trackEvent("click_workflow", { workflow: workflow.title });
                    setOpen(false);
                  }}
                >
                  <Card sx={{ minWidth: 300, height: "inherit" }}>
                    <CardMedia
                      sx={{
                        height: "clamp(0px, 150px, calc(100vh - 765px))",
                        maxHeight: "calc(100vh - 640px)",
                      }}
                      image={workflow.image}
                    />
                    <CardContent>
                      <Typography gutterBottom variant="h5">
                        {workflow.title}
                      </Typography>
                      <Typography>{workflow.description}</Typography>
                    </CardContent>
                  </Card>
                </CardActionArea>
              </Link>
            </Grid>
          ))}
        </Grid>
        <Stack sx={{ pt: 2 }} spacing={2}>
          <Typography>
            Ready to take the next step and start working with your own data?
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              href="https://github.com/voxel51/fiftyone"
              onClick={() => {
                trackEvent("click_install_open_source_locally");
              }}
              target="_blank"
              sx={ORANGE_OUTLINED_BUTTON_STYLE}
            >
              Install open source locally
            </Button>
            <Button
              variant="contained"
              href="https://voxel51.com/book-a-demo/"
              onClick={() => {
                trackEvent("click_schedule_demo");
              }}
              target="_blank"
            >
              Schedule a demo
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </Box>
  );
}

const WORKFLOWS = [
  {
    title: "Explore Embeddings",
    description:
      "Learn how to leverage embeddings to find mistakes and outliers in your dataset in a few simple steps.",
    image: "/workflows/bdd.png",
    href: "/datasets/try-bdd/samples",
  },
  {
    title: "Filter and Evaluate Datasets",
    description:
      "Model evaluation can be hard. See how FiftyOne can help you find samples of interest and take action to refine your data and models.",
    image: "/workflows/visdrone.png",
    href: "/datasets/try-visdrone/samples",
  },
  {
    title: "Curate Unlabeled Data",
    description:
      "Discover the tools available to you to explore, curate, clean, and automatically annotate your unlabeled data.",
    image: "/workflows/bear.png",
    href: "/datasets/try-coco/samples",
  },
  {
    title: "VoxelGPT",
    description:
      "VoxelGPT is an open source plugin that translates your natural language prompts into actions that organize and explore your data.",
    image: "/workflows/voxelgpt.png",
    href: "/datasets/coco-demo/samples",
  },
];

const ORANGE_OUTLINED_BUTTON_STYLE: SxProps = {
  borderColor: (theme) => theme.palette.voxel.main,
  color: (theme) => theme.palette.voxel.main,
  ":hover": {
    borderColor: (theme) => theme.palette.voxel.main,
  },
};
