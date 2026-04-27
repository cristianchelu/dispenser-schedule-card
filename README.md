# Dispenser Schedule Card

> A simple card to view and control dispenser schedules in
> [Home Assistant](https://www.home-assistant.io/).

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)

![Screenshot of dispenser schedule card](docs/screenshot.png)

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Supported devices](#supported-devices)
- [Card configuration](#card-configuration)
  - [`alternate_unit` options](#alternate_unit-options)
  - [Pluralization](#pluralization)
  - [Display customization](#display-customization)
- [Compatibility](#compatibility)
- [Languages](#languages)

## Installation

### Using HACS

[![Open your Home Assistant instance and open the repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg?style=flat-square)](https://my.home-assistant.io/redirect/hacs_repository/?owner=cristianchelu&repository=dispenser-schedule-card&category=plugin)

Or follow these steps:

1. Open HACS (Home Assistant Community Store)
2. Click on the three dots in the top right corner
3. Click on `Custom repositories`
4. In the Repository field, enter https://github.com/cristianchelu/dispenser-schedule-card/
5. In the Category field, select `Dashboard`
6. Click on `Add`
7. Search for `Dispenser Schedule Card` in the list
8. Install the card

More information and screenshots in the official guide:
https://hacs.xyz/docs/faq/custom_repositories/

### Manually

Download `dispenser-schedule-card.min.js` from the Releases tab of this
repository and place it under your `www` folder, then add it as a resource
of type "Javascript Module", following the official Home Assistant guide:
https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources

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

| Device                                       | `device.type`           | Companion integration                                                                       | Capabilities                                                                           | Docs                                                           |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Xiaomi Smart Pet Feeder (`mmgg.feeder.fi1`)  | `xiaomi-smart-feeder`   | [esphome-miot](https://github.com/dhewg/esphome-miot/blob/main/config/mmgg.feeder.fi1.yaml) | Full schedule control                                                                  | [docs/xiaomi-smart-feeder.md](docs/xiaomi-smart-feeder.md)     |
| Xiaomi Smart Pet Feeder 2                    | `xiaomi-smart-feeder-2` | [Xiaomi Home (official)](https://github.com/XiaoMi/ha_xiaomi_home)                          | Full schedule control                                                                  | [docs/xiaomi-smart-feeder-2.md](docs/xiaomi-smart-feeder-2.md) |
| PetLibro dry feeders                         | `petlibro`              | [jjjonesjr33/petlibro](https://github.com/jjjonesjr33/petlibro)                             | Full control, weekly schedule, today-skip, lure sound, per-entry labels                | [docs/petlibro.md](docs/petlibro.md)                           |
| PetKit feeders (Fresh Element, YumShare)     | `petkit`                | [Jezza34000/homeassistant_petkit](https://github.com/Jezza34000/homeassistant_petkit)       | Full schedule + weekly (dual-hopper aware); no per-entry toggle / today-skip in HA yet | [docs/petkit.md](docs/petkit.md)                               |
| DIY ESPHome dispensers / other state sources | `custom`                | any (see [docs/dispenser-blueprint.yaml](docs/dispenser-blueprint.yaml))                    | Depends on the services you wire up                                                    | [docs/custom.md](docs/custom.md)                               |

Don't see your device? See [Compatibility](#compatibility) below.

## Card configuration

These options apply to any device. For device-specific keys (`entity`,
`device_id`, `switch`, `actions`, etc.), follow the link in
[Supported devices](#supported-devices) above.

| Name                  | Required     | Description                                                                                                                                                                                    |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`              | **Required** | Device block. Must include `type` (one of `xiaomi-smart-feeder`, `xiaomi-smart-feeder-2`, `petlibro`, `petkit`, `custom`). All other keys depend on the device type — see the per-device docs. |
| `editable`            | _Optional_   | Whether the schedule is editable. `always`, `toggle`, or `never`.<br><br>Defaults to `toggle` when the device supports editing or toggling; otherwise `never`.                                 |
| `unit_of_measurement` | _Optional_   | Unit label. String or object with plural forms — see [Pluralization](#pluralization).<br><br>Defaults to `portions`.                                                                           |
| `alternate_unit`      | _Optional_   | Display a secondary unit of measurement, with a conversion factor — see [`alternate_unit` options](#alternate_unit-options).                                                                   |
| `display`             | _Optional_   | Per-status display overrides — see [Display customization](#display-customization).                                                                                                            |

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

## Compatibility

Minimum Home Assistant version: **2026.4.0**.

Support for additional devices can be added when enough is known about the
schedule structure. Please open an issue with as much detail as possible
about the entity state, attributes, and services your integration provides.

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

Contributions are welcome!
