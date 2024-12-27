import fiftyone as fo

import torch
from tqdm import tqdm
import numpy as np

import utils

DEVICE = torch.device("cuda:0")


def main(dataset, num_classes, num_epochs, device, save_dir):
    global DEVICE
    DEVICE = torch.device(device)
    model = utils.setup_model(num_classes).to(DEVICE)
    loss_function = torch.nn.CrossEntropyLoss(reduction="none")
    dataloaders = utils.create_dataloaders(
        dataset,
        utils.mnist_get_item,
        num_workers=4,
        batch_size=16,
        persistent_workers=True,
    )
    optimizer = utils.setup_optim(model)

    best_epoch = None
    best_loss = np.inf
    for epoch in range(num_epochs):
        train_epoch(model, dataloaders["train"], loss_function, optimizer)
        validation_loss = validation(
            model, dataloaders["validation"], dataset, loss_function
        )

        if validation_loss < best_loss:
            best_loss = validation_loss
            print(f"New best lost achieved : {best_loss}. Saving model...")
            best_epoch = epoch
            torch.save(model.state_dict(), f"{save_dir}/epoch_{epoch}.pt")

    model = utils.setup_model(
        num_classes, f"{save_dir}/epoch_{best_epoch}.pt"
    ).to(DEVICE)
    test_loss = validation(
        model, dataloaders["test"], dataset, loss_function, save_results=True
    )
    classes = [
        utils.mnist_index_to_label_string(i) for i in range(num_classes)
    ]
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


def train_epoch(model, dataloader, loss_function, optimizer):
    model.train()

    cummulative_loss = 0
    pbar = tqdm(enumerate(dataloader), total=len(dataloader))
    for batch_num, batch in pbar:
        batch["image"] = batch["image"].to(DEVICE)
        batch["label"] = batch["label"].to(DEVICE)

        prediction = model(batch["image"])
        loss = torch.mean(loss_function(prediction, batch["label"]))

        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

        cummulative_loss = cummulative_loss + loss.detach().cpu().numpy()
        if batch_num % 100 == 0:
            pbar.set_description(
                f"Average Train Loss = {cummulative_loss / (batch_num + 1):10f}"
            )
    return cummulative_loss / (batch_num + 1)


@torch.no_grad()
def validation(model, dataloader, dataset, loss_function, save_results=False):
    model.eval()

    cummulative_loss = 0
    pbar = tqdm(enumerate(dataloader), total=len(dataloader))
    for batch_num, batch in pbar:
        with torch.no_grad():
            batch["image"] = batch["image"].to(DEVICE)
            batch["label"] = batch["label"].to(DEVICE)

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

        cummulative_loss = cummulative_loss + np.mean(loss_individual)
        if batch_num % 100 == 0:
            pbar.set_description(
                f"Average Validation Loss = {cummulative_loss / (batch_num + 1):10f}"
            )
    return cummulative_loss / (batch_num + 1)


if __name__ == "__main__":
    pass
