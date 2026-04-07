import { html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";

export type RowStyleMap = Record<string, string | undefined>;

export interface EntityRowOptions {
  className?: string;
  icon?: string;
  image?: string;
  iconColor?: string;
  nameContent?: unknown;
  nameTitle?: string;
  secondaryContent?: unknown;
  valueContent?: unknown;
  style?: RowStyleMap;
}

export function renderEntityRow(options: EntityRowOptions) {
  const hasSecondary =
    options.secondaryContent !== undefined && options.secondaryContent !== "";
  const className = ["dispenser-entity-row", options.className]
    .filter(Boolean)
    .join(" ");

  return html`
    <div class=${className} style=${styleMap(options.style ?? {})}>
      <div class="dispenser-entity-row__row">
        <state-badge
          .overrideIcon=${options.icon}
          .overrideImage=${options.image}
          .color=${options.iconColor}
        ></state-badge>
        <div
          class="dispenser-entity-row__info"
          .title=${options.nameTitle ?? ""}
        >
          <div class="dispenser-entity-row__primary">
            ${options.nameContent ?? nothing}
          </div>
          ${hasSecondary
            ? html`
                <div class="dispenser-entity-row__secondary">
                  ${options.secondaryContent}
                </div>
              `
            : nothing}
        </div>
        <div class="dispenser-entity-row__value">
          <div class="dispenser-entity-row__state">
            ${options.valueContent ?? nothing}
          </div>
        </div>
      </div>
    </div>
  `;
}
