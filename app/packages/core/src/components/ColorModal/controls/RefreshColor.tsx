import React from "react";
import { useRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { Button } from "../../utils";
import { Autorenew } from "@mui/icons-material";

const ShuffleColor: React.FC = () => {
  const [colorSeed, setColorSeed] = useRecoilState(fos.colorSeed);
  return (
    <>
      <Button
        text={
          <span style={{ display: "flex", justifyContent: "center" }}>
            Shuffle all field colors{" "}
            <Autorenew
              style={{
                marginLeft: "0.25rem",
                color: "inherit",
              }}
            />
          </span>
        }
        title={"Shuffle field colors"}
        onClick={() => setColorSeed(colorSeed + 1)}
        style={{
          margin: "0.25rem -0.5rem",
          height: "2rem",
          textAlign: "center",
          flex: 1,
          width: "200px",
        }}
      ></Button>
    </>
  );
};

export default ShuffleColor;
