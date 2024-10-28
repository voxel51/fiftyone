import { ancestorPath } from "@fiftyone/teams-utilities";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { IconButton, Link } from "@mui/material";
import NextLink from "next/link";

export default function BackButton(props: BackButtonPropsType) {
  const { toName, level = 1 } = props;

  const backPath = ancestorPath(window.location.pathname, level);

  return (
    <NextLink href={backPath} passHref>
      <Link>
        <IconButton title={`Back to ${toName || "previous page"}`}>
          <ArrowBackIcon color="secondary" />
        </IconButton>
      </Link>
    </NextLink>
  );
}

type BackButtonPropsType = {
  toName?: string;
  level?: number;
};
