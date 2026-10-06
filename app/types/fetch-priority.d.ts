// Fetch Priority (RequestInit.priority) is missing from TypeScript 4.9's DOM
// lib; browsers that don't support it ignore the field.
interface RequestInit {
  priority?: "high" | "low" | "auto";
}
