// https://github.com/custom-cards/boilerplate-card/blob/master/src/localize/localize.ts

import * as ca from "./translations/ca.json";
import * as de from "./translations/de.json";
import * as en from "./translations/en.json";
import * as es from "./translations/es.json";
import * as fr from "./translations/fr.json";
import * as it from "./translations/it.json";
import * as nl from "./translations/nl.json";
import * as ro from "./translations/ro.json";
import * as tr from "./translations/tr.json";

type Translations = {
  [key: string]: string | Translations;
};

const languages: Record<string, Translations> = {
  ca,
  de,
  en,
  es,
  fr,
  it,
  nl,
  ro,
  tr,
};

const DEFAULT_LANG = "en";

/** Walks a dotted key path, e.g. `editor.field.entity`. */
function lookup(
  translations: Translations | undefined,
  path: string[]
): string | undefined {
  let node: string | Translations | undefined = translations;
  for (const part of path) {
    if (typeof node !== "object") return;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export default function localize(
  str: string,
  search?: string,
  replace?: string
): string | undefined {
  const path = str.toLowerCase().split(".");

  let langStored: string | null = null;

  try {
    langStored = JSON.parse(localStorage.getItem("selectedLanguage") ?? "");
  } catch (e) {
    langStored = localStorage.getItem("selectedLanguage");
  }

  const lang = (langStored || navigator.language.split("-")[0] || DEFAULT_LANG)
    .replace(/['"]+/g, "")
    .replace("-", "_");

  let translated =
    lookup(languages[lang], path) ?? lookup(languages[DEFAULT_LANG], path);
  if (translated === undefined) {
    return;
  }

  if (search && replace) {
    translated = translated?.replace(search, replace);
  }

  return translated;
}
