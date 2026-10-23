import type { OfficeTheme } from "@pvta/shared";

export interface ThemeCatalogMsg {
  host: string;
  themes: OfficeTheme[];
  colors: OfficeTheme[];
  fonts: OfficeTheme[];
  source: "office" | "builtin";
  dirs: string[];
}

let current: ThemeCatalogMsg | null = null;
export const setThemeCatalog = (c: ThemeCatalogMsg | null) => {
  current = c;
};
export const getThemeCatalog = () => current;
