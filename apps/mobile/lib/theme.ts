import { useColorScheme } from "react-native";

// Same palette as the web dashboard (apps/web/app/globals.css).
const palette = {
  light: {
    paper: "#F3F5F8",
    surface: "#FFFFFF",
    ink: "#14213D",
    muted: "#5A6B85",
    line: "#DCE2EB",
    mark: "#FFD84D",
    markInk: "#14213D",
    danger: "#B42318",
  },
  dark: {
    paper: "#0E1524",
    surface: "#172036",
    ink: "#E8ECF3",
    muted: "#93A1B8",
    line: "#26314A",
    mark: "#E9C33A",
    markInk: "#0E1524",
    danger: "#F97066",
  },
};

export type Theme = typeof palette.light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}
