import { useState } from "react";

const initialSavedSpaces = Array.from({ length: 25 }, (_, i) => ({
  name: `Layout ${i + 1}`,
  id: `${i + 1}`,
}));

export function useSavedSpaces() {
  const [savedSpaces, setSavedSpaces] = useState(initialSavedSpaces);

  const addSavedSpace = (name: string) => {
    setSavedSpaces((spaces) => [
      { name, id: Math.random().toString(36).substring(2, 9) },
      ...spaces,
    ]);
  };

  const deleteSavedSpace = (id: string) => {
    setSavedSpaces((spaces) => spaces.filter((space) => space.id !== id));
  };

  const onUpdate = (id: string, name: string) => {
    setSavedSpaces((spaces) =>
      spaces.map((space) => (space.id === id ? { ...space, name } : space))
    );
  };

  return {
    savedSpaces,
    addSavedSpace,
    deleteSavedSpace,
    onUpdate,
  };
}
