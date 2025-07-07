import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useRecoilState } from "recoil";
import { selectedModelEvaluation } from "./utils";

const ConfirmationDialog = ({
  open,
  handleClose,
  handleDelete,
  evaluations,
}) => {
  const dialogTitle = "Delete model evaluation?";
  const [selectedEvaluation, setSelectedEvaluation] = useRecoilState(
    selectedModelEvaluation
  );

  const handleConfirm = () => {
    const evalId = evaluations.find(
      (evaluation) => evaluation.key === selectedEvaluation
    ).id;
    handleDelete(evalId, selectedEvaluation);
    setSelectedEvaluation(null);
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle id="confirmation-dialog-title">{dialogTitle}</DialogTitle>
      <DialogContent>
        <DialogContentText id="confirmation-dialog-description">
          {`Are you sure you want to delete the model evaluation `}
          <strong>{selectedEvaluation}</strong>
          {`? This action cannot be undone.`}
        </DialogContentText>
      </DialogContent>
      <DialogActions
        sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}
      >
        <Button
          onClick={handleClose}
          variant="outlined"
          color="secondary"
          sx={{ width: "50%" }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          autoFocus
          sx={{ width: "50%" }}
        >
          Delete evaluation
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmationDialog;
