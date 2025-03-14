from argparse import ArgumentParser
import os

import fiftyone as fo
from fiftyone.utils.torch import all_gather, FiftyOneTorchDataset

import torch
from tqdm import tqdm
import numpy as np

import utils


def main(local_rank, dataset_name, num_classes, num_epochs, save_dir):

    torch.distributed.init_process_group()

    #### START FIFTYONE DISTRIBUTED INIT CODE ####
    local_group = torch.distributed.new_group()
    torch.distributed.barrier()

    dataset = FiftyOneTorchDataset.distributed_init(
        dataset_name, local_process_group=local_group
    )
    #### END FIFTYONE DISTRIBUTED INIT CODE ####

    model = utils.setup_ddp_model(num_classes=num_classes)
    model.to(DEVICES[local_rank])
    ddp_model = torch.nn.parallel.DistributedDataParallel(
        model, device_ids=[DEVICES[local_rank]]
    )

    loss_function = torch.nn.CrossEntropyLoss(reduction="none")

    dataloaders = utils.create_dataloaders_ddp(
        dataset,
        utils.mnist_get_item,
        local_process_group=local_group,
        num_workers=4,
        batch_size=16,
        persistent_workers=True,
    )
    optimizer = utils.setup_optim(ddp_model)

    best_epoch = None
    best_loss = np.inf
    for epoch in range(num_epochs):
        train_epoch(
            local_rank,
            ddp_model,
            dataloaders["train"],
            loss_function,
            optimizer,
        )
        validation_loss = validation(
            local_rank,
            ddp_model,
            dataloaders["validation"],
            dataset,
            loss_function,
        )

        # average over all trainers
        validation_loss = np.mean(all_gather(validation_loss))

        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch
            if local_rank == 0:
                print(f"New best lost achieved : {best_loss}. Saving model...")
                torch.save(model.state_dict(), f"{save_dir}/epoch_{epoch}.pt")

    torch.distributed.barrier()

    model = utils.setup_ddp_model(
        num_classes=num_classes,
        weights_path=f"{save_dir}/epoch_{best_epoch}.pt",
    ).to(DEVICES[local_rank])
    model.to(DEVICES[local_rank])
    ddp_model = torch.nn.parallel.DistributedDataParallel(
        model, device_ids=[DEVICES[local_rank]]
    )
    test_loss = validation(
        local_rank,
        ddp_model,
        dataloaders["test"],
        dataset,
        loss_function,
        save_results=True,
    )
    test_loss = np.mean(all_gather(test_loss))
    classes = [
        utils.mnist_index_to_label_string(i) for i in range(num_classes)
    ]
    if local_rank == 0:
        results = dataset.match_tags("test").evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=classes,
            k=3,
        )

        print("Final Test Results:")
        print(f"Loss = {test_loss}")
        results.print_report(classes=classes)

    torch.distributed.destroy_process_group(local_group)
    torch.distributed.destroy_process_group()


def train_epoch(local_rank, model, dataloader, loss_function, optimizer):
    model.train()

    cumulative_loss = 0
    pbar = (
        tqdm(enumerate(dataloader), total=len(dataloader))
        if local_rank == 0
        else enumerate(dataloader)
    )
    final_batch_num = 0
    for batch_num, batch in pbar:
        final_batch_num = batch_num
        batch["image"] = batch["image"].to(DEVICES[local_rank])
        batch["label"] = batch["label"].to(DEVICES[local_rank])

        prediction = model(batch["image"])
        loss = torch.mean(loss_function(prediction, batch["label"]))

        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

        cumulative_loss = cumulative_loss + loss.detach().cpu().numpy()
        if local_rank == 0:
            if batch_num % 100 == 0:
                pbar.set_description(
                    f"Average Train Loss = {cumulative_loss / (batch_num + 1):10f}"
                )
    return cumulative_loss / (final_batch_num + 1)


@torch.no_grad()
def validation(
    local_rank, model, dataloader, dataset, loss_function, save_results=False
):
    model.eval()

    cumulative_loss = 0
    pbar = (
        tqdm(enumerate(dataloader), total=len(dataloader))
        if local_rank == 0
        else enumerate(dataloader)
    )
    final_batch_num = 0
    for batch_num, batch in pbar:
        final_batch_num = batch_num
        with torch.no_grad():
            batch["image"] = batch["image"].to(DEVICES[local_rank])
            batch["label"] = batch["label"].to(DEVICES[local_rank])

            prediction = model(batch["image"])
            loss_individual = (
                loss_function(prediction, batch["label"])
                .detach()
                .cpu()
                .numpy()
            )

        if save_results:
            samples = dataset._dataset.select(batch["id"])
            samples.set_values("loss", loss_individual.tolist())

            fo_predictions = [
                fo.Classification(
                    label=utils.mnist_index_to_label_string(
                        np.argmax(sample_logits)
                    ),
                    logits=sample_logits,
                )
                for sample_logits in prediction.detach().cpu().numpy()
            ]
            samples.set_values("predictions", fo_predictions)
            samples.save()

        cumulative_loss = cumulative_loss + np.mean(loss_individual)
        if local_rank == 0:
            if batch_num % 100 == 0:
                pbar.set_description(
                    f"Average Validation Loss = {cumulative_loss / (batch_num + 1):10f}"
                )
    return cumulative_loss / (final_batch_num + 1)


if __name__ == "__main__":

    """run with
    torchrun --nnodes=1 --nproc-per-node=6 \
    PATH/TO/YOUR/ddp_train.py -d mnist -n 10 -e 3 \
    -s /PATH/TO/SAVE/WEIGHTS --devices 2 3 4 5 6 7"""

    argparser = ArgumentParser()
    argparser.add_argument(
        "-d", "--dataset", type=str, help="name of fiftyone dataset"
    )
    argparser.add_argument(
        "-n",
        "--num_classes",
        type=int,
        help="number of classes in the dataset",
    )
    argparser.add_argument(
        "-e",
        "--epochs",
        type=int,
        help="number of epochs to train for",
        default=5,
    )
    argparser.add_argument(
        "-s",
        "--save_dir",
        type=str,
        help="directory to save checkpoints to",
        default="~/mnist_weights",
    )
    argparser.add_argument(
        "--devices", default=range(torch.cuda.device_count()), nargs="*"
    )

    args = argparser.parse_args()

    assert int(os.environ["LOCAL_WORLD_SIZE"]) == len(args.devices)

    DEVICES = [torch.device(f"cuda:{d}") for d in args.devices]

    local_rank = int(os.environ["LOCAL_RANK"])

    torch.multiprocessing.set_start_method("spawn")
    # torch.multiprocessing.set_forkserver_preload(["torch", "fiftyone"])

    main(
        local_rank, args.dataset, args.num_classes, args.epochs, args.save_dir
    )
