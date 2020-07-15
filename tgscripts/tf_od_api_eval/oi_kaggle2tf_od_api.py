"""
Convert a Open Images Kaggle format predictions CSV to Tensorflow Object
Detection API format.

Kaggle Format:

    ImageID,PredictionString
    ImageID,{Label Confidence XMin YMin XMax YMax} {...}

Tensorflow Format:

    ImageID, LabelName, Score, XMin, XMax, YMin, YMax

"""
import numpy as np
import pandas as pd

import fiftyone.core.utils as fou


# PARAMETERS ##################################################################

IN_PATH = "/Users/tylerganter/data/open-images-dataset/v4/predictions/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions/kaggle_format/74061_images.csv"
OUT_PATH = "/Users/tylerganter/data/open-images-dataset/v4/predictions/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions/tf_od_api_format/74061_images.csv"

###############################################################################


if __name__ == "__main__":
    df = pd.read_csv(IN_PATH)
    print("IN:")
    print(df)

    dataframes = []

    with fou.ProgressBar(df) as pb:
        for row_idx, (image_id, pred_str) in pb(df.iterrows()):
            pred_matrix = (
                np.array(pred_str.split()).reshape(6, 100).reshape(-1, 6)
            )
            d = {"ImageID": image_id, "LabelName": pred_matrix[:, 0]}
            numbers = pred_matrix[:, 1:].astype(float)
            d["Score"] = numbers[:, 0]
            d["XMin"] = numbers[:, 1]
            d["YMin"] = numbers[:, 2]
            d["XMax"] = numbers[:, 3]
            d["YMax"] = numbers[:, 4]

            dataframes.append(pd.DataFrame(d))

    df2 = pd.concat(dataframes)

    print("OUT:")
    print(df2)

    df2.to_csv(OUT_PATH, index=False)
