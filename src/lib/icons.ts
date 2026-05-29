import iconNames from "../../material-symbols-names.json";

const validIcons = new Set<string>(iconNames);

export function isValidIcon(name: string): boolean {
  return validIcons.has(name);
}

export const FALLBACK_ICON = "help";
