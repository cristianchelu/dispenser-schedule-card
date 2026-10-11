/**
 * Subset of Home Assistant's `ha-form` schema used by the editor.
 * https://github.com/home-assistant/frontend/blob/dev/src/components/ha-form/types.ts
 */
export interface HaFormSelectorSchema {
  name: string;
  required?: boolean;
  selector: Record<string, unknown>;
  /** Not part of HA's schema; read back by the editor's `computeHelper`. */
  helper?: string;
}

export interface HaFormGridSchema {
  type: "grid";
  name: string;
  schema: HaFormSchema[];
}

export interface HaFormExpandableSchema {
  type: "expandable";
  /** Nests the section's data under `name` unless `flatten` is set. */
  name: string;
  flatten?: boolean;
  title?: string;
  icon?: string;
  schema: HaFormSchema[];
}

export type HaFormSchema =
  | HaFormSelectorSchema
  | HaFormGridSchema
  | HaFormExpandableSchema;

/**
 * `ha-form` and its selectors are lazy-loaded by HA. Opening a built-in
 * card's editor is the supported way to make sure they are defined.
 */
export async function loadHaForm(): Promise<void> {
  if (customElements.get("ha-form")) return;
  const helpers = await window.loadCardHelpers();
  const card = helpers.createCardElement({
    type: "entities",
    entities: [],
  });
  await (
    card.constructor as unknown as { getConfigElement(): Promise<unknown> }
  ).getConfigElement();
}
