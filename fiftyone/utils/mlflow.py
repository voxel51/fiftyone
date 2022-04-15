""" Utiliies for working with MLFlow.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import codecs
from nbconvert.preprocessors import ExecutePreprocessor
from nbconvert import HTMLExporter
import os
import webbrowser

import eta.core.utils as etau

import fiftyone.core.utils as fou

mlflow = fou.lazy_import(
    "mlflow", callback=lambda: fou.ensure_import("mlflow")
)
nbf = fou.lazy_import(
    "nbformat", callback=lambda: fou.ensure_import("nbformat")
)


def connect_flash_mlflogger(
    sample_collection, mlflow_key, mlf_logger, fields, tracking_uri
):
    experiment_id = mlf_logger._experiment_id
    run_id = mlf_logger._run_id
    connect_to_mlflow(
        sample_collection,
        mlflow_key,
        experiment_id,
        run_id,
        fields,
        tracking_uri,
    )


def connect_to_mlflow(
    sample_collection, mlflow_key, experiment_id, run_id, fields, tracking_uri
):
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.start_run(run_id=run_id)
    _populate_run_info(
        sample_collection, experiment_id, mlflow_key, run_id, fields
    )
    _add_tags_to_run(sample_collection.name, fields)
    _add_nb_to_run(sample_collection, mlflow_key)


def launch_mlflow(sample_collection, mlflow_key):
    url = sample_collection.info["mlflow"][mlflow_key]["url"]
    webbrowser.open(url, new=2)


def _populate_run_info(
    sample_collection, experiment_id, mlflow_key, run_id, fields
):
    if "mlflow" not in sample_collection.info:
        sample_collection.info["mlflow"] = {}

    url = "http://localhost:5000/#/experiments/%s/runs/%s" % (
        experiment_id,
        run_id,
    )
    exp_info_dict = {
        "gt_field": fields["ground_truth"],
        "pred_field": fields["predictions"],
        "experiment_id": experiment_id,
        "run_id": run_id,
        "url": url,
    }
    sample_collection.info["mlflow"][mlflow_key] = exp_info_dict


def _add_tags_to_run(name, fields):
    tags = {
        "FiftyOne Dataset Name": name,
        "FiftyOne Ground Truth Label Field": fields["ground_truth"],
        "FiftyOne Predictions Label Field": fields["predictions"],
    }
    mlflow.log_params(tags)


def _add_nb_to_run(sample_collection, mlflow_key):
    nb_path, html_path = _create_nb(sample_collection, mlflow_key)
    mlflow.log_artifact(nb_path)
    mlflow.log_artifact(html_path)

    etau.delete_file(html_path)
    etau.delete_file(nb_path)


def _create_nb(sample_collection, mlflow_key):
    mlflow_info = sample_collection.info["mlflow"][mlflow_key]
    run_id = mlflow_info["run_id"]
    experiment_id = mlflow_info["experiment_id"]
    gt_field = mlflow_info["gt_field"]
    pred_field = mlflow_info["pred_field"]

    # https://gist.github.com/fperez/9716279
    nb = nbf.v4.new_notebook()
    nb["cells"] = []
    text = """\
# FiftyOne Summary
This notebook was automatically generated for experiment %s, run %s.""" % (
        experiment_id,
        run_id,
    )
    nb["cells"].append(nbf.v4.new_markdown_cell(text))

    code = (
        """\
import fiftyone as fo
import time

dataset = fo.load_dataset("%s")"""
        % sample_collection.name
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
import fiftyone.core.context as foc

print(foc._get_context())
foc._context = foc._IPYTHON"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
view = dataset.select_fields(["%s", "%s"])

print(foc._get_context())
session = fo.launch_app(view)
#time.sleep(5)""" % (
        gt_field,
        pred_field,
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
session.freeze()
#time.sleep(5)"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
results = dataset.evaluate_classifications(
    "%s",
    gt_field="%s",
    eval_key="mlflow_eval",
)""" % (
        pred_field,
        gt_field,
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
plot = results.plot_confusion_matrix()
plot.show()
#time.sleep(2)"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
plot.freeze()"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    ep = ExecutePreprocessor(timeout=600, kernel_name="mlf")
    ep.preprocess(nb, {"metadata": {"path": "/tmp"}})

    nb_path = "/tmp/fiftyone.ipynb"
    html_path = "/tmp/fiftyone.html"

    # Write ipython
    with open(nb_path, "w", encoding="utf-8") as f:
        nbf.write(nb, nb_path)

    # Write HTML to view in MLFlow UI
    exporter = HTMLExporter()
    output, resources = exporter.from_notebook_node(nb)
    codecs.open(html_path, "w", encoding="utf-8").write(output)

    return nb_path, html_path
