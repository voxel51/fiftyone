import React, { useState } from "react";
import { Box, Chip, TextField, IconButton } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

// Define the props interface for the DisplayTags component
interface DisplayTagsProps {
  saveTags: (tags: string[]) => void; // saveTags is a function that accepts an array of strings and returns void
}

const DisplayTags: React.FC<DisplayTagsProps> = ({ saveTags }) => {
  const [chips, setChips] = useState<string[]>([]); // chips is an array of strings
  const [inputValue, setInputValue] = useState<string>(""); // inputValue is a string

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddChip();
    }
  };

  const handleAddChip = () => {
    if (inputValue.trim() !== "") {
      const updatedChips = [...chips, inputValue];
      setChips(updatedChips);
      setInputValue("");
      saveTags(updatedChips); // Call the saveTags function to save the new list of chips
    }
  };

  const handleDeleteChip = (chipToDelete: string) => {
    const updatedChips = chips.filter((chip) => chip !== chipToDelete);
    setChips(updatedChips);
    saveTags(updatedChips); // Call the saveTags function to save the updated list of chips
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "start",
        paddingTop: 1,
        paddingBottom: 1,
        width: "100%", // Ensure the box takes full width
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%", // Ensure the inner box takes full width
        }}
      >
        <TextField
          variant="outlined"
          label="Enter tag"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          fullWidth // Make TextField take up the remaining width
        />
        <IconButton onClick={handleAddChip} color="primary">
          <AddIcon />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {chips.map((chip, index) => (
          <Chip
            key={index}
            label={chip}
            onDelete={() => handleDeleteChip(chip)}
          />
        ))}
      </Box>
    </Box>
  );
};

export default DisplayTags;
