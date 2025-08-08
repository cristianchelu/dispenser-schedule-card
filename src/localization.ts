// https://github.com/custom-cards/boilerplate-card/blob/master/src/localize/localize.ts

import * as ca from "./translations/ca.json";
import * as de from "./translations/de.json";
import * as en from "./translations/en.json";
import * as es from "./translations/es.json";
import * as fr from "./translations/fr.json";
import * as it from "./translations/it.json";
import * as ro from "./translations/ro.json";
import * as tr from "./translations/tr.json";

type Translations = {
  [key: string]: {
    [key: string]: string;
  };
};

const languages: Record<string, Translations> = {
  ca,
  de,
  en,
  es,
  fr,
  it,
  ro,
  tr,
};

const DEFAULT_LANG = "en";

export default function localize(
  str: string,
  search?: string,
  replace?: string
): string | undefined {
  const [section, key] = str.toLowerCase().split(".");

  let langStored: string | null = null;

  try {
    langStored = JSON.parse(localStorage.getItem("selectedLanguage") ?? "");
  } catch (e) {
    langStored = localStorage.getItem("selectedLanguage");
  }

  const lang = (langStored || navigator.language.split("-")[0] || DEFAULT_LANG)
    .replace(/['"]+/g, "")
    .replace("-", "_");

  let translated;

  try {
    translated = languages[lang][section][key];
  } catch (e) {
    translated = languages[DEFAULT_LANG][section][key];
  }
  if (translated === undefined) {
    translated = languages[DEFAULT_LANG][section][key];
  }
  if (translated === undefined) {
    return;
  }

  if (search && replace) {
    translated = translated?.replace(search, replace);
  }

  return translated;
}
