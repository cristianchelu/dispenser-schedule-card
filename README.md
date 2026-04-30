# Dispenser Schedule Card

> A simple card to view and control dispenser schedules in
> [Home Assistant](https://www.home-assistant.io/).

[hacs_badge](https://github.com/hacs/integration)

Screenshot of dispenser schedule card

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Supported devices](#supported-devices)
- [Card configuration](#card-configuration)
  - [Alternate units](#alternate_unit-options)
  - [Pluralization](#pluralization)
  - [Display customization](#display-customization)
- [Languages](#languages)
- [Contributing](#contributing)

## Installation

Minimum Home Assistant version: **2026.4.0**.

### Using HACS

[Open your Home Assistant instance and open the repository inside the Home Assistant Community Store.](https://my.home-assistant.io/redirect/hacs_repository/?owner=cristianchelu&repository=dispenser-schedule-card&category=plugin)

Or follow these steps:

1. Open HACS (Home Assistant Community Store)
2. Click on the three dots in the top right corner
3. Click on `Custom repositories`
4. In the Repository field, enter [https://github.com/cristianchelu/dispenser-schedule-card/](https://github.com/cristianchelu/dispenser-schedule-card/)
5. In the Category field, select `Dashboard`
6. Click on `Add`
7. Search for `Dispenser Schedule Card` in the list
8. Install the card

More information and screenshots in the official guide:
[https://hacs.xyz/docs/faq/custom_repositories/](https://hacs.xyz/docs/faq/custom_repositories/)

### Manually

Download `dispenser-schedule-card.min.js` from the Releases tab of this
repository and place it under your `www` folder, then add it as a resource
of type "Javascript Module", following the official Home Assistant guide:
[https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources)

## Quick start

```yaml
type: custom:dispenser-schedule-card
device:
  type: petlibro
  device_id: abc123def456...
```

Each device family has its own minimal configuration. Pick yours from
[Supported devices](#supported-devices) below.

## Supported devices

| Device                      | `device.type`           | Companion integration                                                                       | Capabilities / Docs                              |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Xiaomi Smart Pet Feeder[^1] | `xiaomi-smart-feeder`   | [esphome-miot](https://github.com/dhewg/esphome-miot/blob/main/config/mmgg.feeder.fi1.yaml) | [Full control 📖](docs/xiaomi-smart-feeder.md)   |
| Xiaomi Smart Pet Feeder 2   | `xiaomi-smart-feeder-2` | [Xiaomi Home (official)](https://github.com/XiaoMi/ha_xiaomi_home)                          | [Full control 📖](docs/xiaomi-smart-feeder-2.md) |
| PetLibro dry feeders        | `petlibro`              | [jjjonesjr33/petlibro](https://github.com/jjjonesjr33/petlibro)                             | [Full control 📖](docs/petlibro.md)              |
| PetKit dry feeders          | `custom`                | [Jezza34000/homeassistant_petkit](https://github.com/Jezza34000/homeassistant_petkit)       | [Display only 📖](docs/petkit.md)                |
| DIY / Others                | `custom`                | Any ([Example ESPHome config](docs/dispenser-blueprint.yaml))                               | [Custom :) 📖](docs/custom.md)                   |

[^1]: `mmgg.feeder.fi1`, only when modified with ESPHome firmware.

## Card configuration

| Name                  | Required     | Description                                                                                                                                             |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`              | **Required** | Device block. Must include `type`. All other keys in this block depend on the device type — see the per-device docs in the table above for specifics.   |
| `editable`            | _Optional_   | Whether the schedule is editable. `always`, `toggle`, or `never`. Defaults to `toggle` when the device supports editing or toggling; otherwise `never`. |
| `unit_of_measurement` | _Optional_   | Unit label. String or object with plural forms — see [Pluralization](#pluralization). Defaults to `portions`.                                           |
| `alternate_unit`      | _Optional_   | Display a secondary unit of measurement, with a conversion factor — see [`alternate_unit` options](#alternate_unit-options).                            |
| `display`             | _Optional_   | Per-status display overrides — see [Display customization](#display-customization).                                                                     |

### `alternate_unit` options

| Name                  | Required     | Description                                                                                    |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `unit_of_measurement` | **Required** | Secondary unit label. String or object with plural forms. See [Pluralization](#pluralization). |
| `conversion_factor`   | **Required** | Number to multiply the primary amount by.                                                      |
| `approximate`         | _Optional_   | Whether the alternate unit is an approximation. Adds a `~` prefix to the value.                |

Example:

```yaml
unit_of_measurement: portions
alternate_unit:
  unit_of_measurement: g
  conversion_factor: 5
  approximate: true
```

### Pluralization

Both `unit_of_measurement` and `alternate_unit.unit_of_measurement` support
pluralization based on
[Unicode plural rules](https://www.unicode.org/cldr/charts/43/supplemental/language_plural_rules.html).

Simple string format:

```yaml
unit_of_measurement: portions
alternate_unit:
  unit_of_measurement: grams
```

Pluralization object format:

```yaml
unit_of_measurement:
  one: portion
  other: portions
alternate_unit:
  unit_of_measurement:
    one: gram
    other: grams
```

The plural-rule language is always the current logged-in user's Home
Assistant language setting.

### Display customization

Each status row's icon, color, and label can be overridden via the `display`
option:

| Name    | Required   | Description                                                                        |
| ------- | ---------- | ---------------------------------------------------------------------------------- |
| `color` | _Optional_ | CSS color value to use for the status.                                             |
| `icon`  | _Optional_ | Icon to display for the status. Uses Material Design Icons (e.g. `mdi:icon-name`). |
| `label` | _Optional_ | Text label for the status, overriding any default translation.                     |

Example:

```yaml
display:
  failed:
    color: var(--success-color)
    label: Task failed successfully
  dispensed:
    icon: mdi:bowl-mix
```

The card recognizes the following canonical statuses (case-sensitive):

`dispensed`, `dispensing`, `pending`, `failed`, `skipped`, `disabled`, `unknown`.

Some integrations expose additional **native** sub-status keys layered on
top of the canonical statuses (for example, an entry skipped only for today
versus one permanently disabled). Native keys can be targeted directly:

```yaml
display:
  skipped:
    icon: mdi:ghost
  to_be_skipped:
    label: Tomorrow
```

Each field falls back independently: `display[<native-key>].<field>` falls
back to `display[<canonical-status>].<field>`, which falls back to the card
default. See your device's docs page for the native keys it exposes.

#### Styling rows via CSS

Rows expose a `data-native-status="<key>"` attribute for integration-specific
states, so stylesheets can target them safely:

```css
.dispenser-entity-row[data-native-status="to_be_skipped"] {
  opacity: 0.6;
}
```

## Languages

Translations are currently available for the following languages:

- Català (Catalan)
- Deutsch (German)
- English
- Español (Spanish)
- Français (French)
- Italiano (Italian)
- Română (Romanian)
- Türkçe (Turkish)

## Contributing

Support for additional devices can be added when enough is known about the
schedule structure. Please open an issue with as much detail as possible
about the entity state, attributes, and services your integration provides.

Contributions are welcome!
