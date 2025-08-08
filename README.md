# Dispenser Schedule Card

> A very simple card to view and control dispenser schedules for the
> [Home Assistant](https://www.home-assistant.io/) Lovelace / Grace UI

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)

![Screenshot of dispenser schedule card](docs/screenshot.png)

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
repository and place it in under your `www` folder, then add this as resource
type "Javascript Module", by following the official HA guide:
https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources

## Usage

Typical YAML:

```yaml
type: custom:dispenser-schedule-card
entity: sensor.feeder_raw_feed_plan
switch: switch.feeder_feeding_schedule
actions:
  add: esphome.feeder_add_scheduled_feed
  edit: esphome.feeder_edit_scheduled_feed
  remove: esphome.feeder_remove_scheduled_feed
alternate_unit:
  unit_of_measurement: g
  conversion_factor: 5
  approximate: true
```

### Options

| Name                  | Required     | Description                                                                                                                             |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`              | **Required** | An entity_id in the `sensor` domain containing the schedule                                                                             |
| `switch`              | _Optional_   | An entity_id in the `switch` domain containing the on/off toggle for the schedule.                                                      |
| `actions`             | _Optional_   | `add`, `edit`, `remove`, and `toggle` (enable/disable individual entry) actions.                                                        |
| `editable`            | _Optional_   | Whether the schedule is editable. `always`, `toggle`, or `never`.<br><br> Default `toggle` if `actions` are defined, otherwise `never`. |
| `unit_of_measurement` | _Optional_   | Unit label. String or object with plural forms. See [Pluralization](#pluralization). <br><br> Default `portions`.                       |
| `alternate_unit`      | _Optional_   | Configuration to display a secondary unit of measurement, with a conversion factor.                                                     |
| `device`              | _Optional_   | See [Custom Device Parsing](#custom-device-parsing)                                                                                     |
| `display`             | _Optional_   | See [Display customization](#display-customization)                                                                                     |

#### `actions` options

| Name     | Required   | Description                                                  |
| -------- | ---------- | ------------------------------------------------------------ |
| `add`    | _Optional_ | action_id that accepts `id`, `hour`, `minute`, `amount` `*`. |
| `edit`   | _Optional_ | action_id that accepts `id`, `hour`, `minute`, `amount` `*`. |
| `remove` | _Optional_ | action_id that accepts `id`.                                 |
| `toggle` | _Optional_ | action_id that accepts `id`.                                 |

`*` - `portions` (legacy) is also accepted as a parameter instead of `amount`.

#### `alternate_unit` options

| Name                  | Required     | Description                                                                                    |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `unit_of_measurement` | **Required** | Secondary unit label. String or object with plural forms. See [Pluralization](#pluralization). |
| `conversion_factor`   | **Required** | Number to multiply the primary amount by                                                       |
| `approximate`         | _Optional_   | Whether the alternate unit is an approximation. Adds a `~` prefix to the value                 |

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

Language for which the pluralization rules apply is always the current logged in
user's language setting.

## Compatibility

### Xiaomi Smart Pet Feeder (`mmgg.feeder.fi1`)

This card was originally created for the Xiaomi Smart Pet Feeder running
ESPHome firmware with the [esphome-miot](https://github.com/dhewg/esphome-miot/blob/main/config/mmgg.feeder.fi1.yaml)
component and offers full support for it.

The sensor entity state follows this comma-separated format:
`[int id],[int hour],[int minute],[int amount],[int status]`

Where:

- `id` - entry index (0-9)
- `hour` - dispense hour (0-23)
- `minute` - dispense minute (0-59)
- `amount` - portions to dispense (1-30)
- `status` - current state: `0` (dispensed), `1` (failed), `254` (dispensing), `255` (pending)

Example: `0,10,30,5,0,1,12,0,10,255` represents two entries:

- Entry 0: 10:30, dispense 5 portions, already dispensed
- Entry 1: 12:00, dispense 10 portions, pending

See how this format is parsed using regex in [Custom Device Parsing](#status_pattern-details).

Feeders with the original firmware are _NOT_ currently supported as much of the
logic is not handled by the device itself.

### PetKit Feeders (Fresh Element, YumShare)

The [`homeassistant_petkit`](https://github.com/Jezza34000/homeassistant_petkit) custom integration by [@Jezza34000](https://github.com/Jezza34000) is compatible with this card.

### DIY ESPHome projects

View this [ESPHome config example](./docs/dispenser-blueprint.yaml) to get started.
It features a 10-entry schedule completely on device, compatible with this card.

You may use it as a starting point for, or as an enhancement to your own DIY
cat/dog/bird/fish feeders, or other generic dispensers that require offline
or battery-powered scheduling.

Please note that it is modelled after the original xiaomi device behavior and
may not be the best way of handling an on-device schedule, especially as the
ESPHome project matures and gains new features with time.

### Others

Support for other types of dispensers can be added if enough is known
about the structure.

Please open an issue including as much detail as available.

### Custom Device Parsing

The card supports custom device parsing for advanced use cases.
This allows you to define custom schedules, statuses, and display options for
devices that do not follow the Xiaomi structure.

#### Computed Statuses

The card automatically calculates additional status options for better clarity:

**`skipped`** status is assumed when:

- the schedule entry is status `pending` and,
- the current Home Assistant time is greater than the dispense time.

This indicates an entry was not dispensed due to external factors
such as a lack of power or the schedule being disabled at the dispense time,
but not a failure of the device itself.

**`disabled`** status is assumed when:

- the schedule entry is status `pending` and,
- the dispense time is greater than current Home Assistant time and,
- there exists a `switch` entry in the card config and,
- the `switch` entity is off.

This indicates that future dispense entries will **not** be executed because
the schedule is currently disabled.

#### `device` Options

| Name             | Required     | Description                                                                                     |
| ---------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `type`           | **Required** | Must be set to `custom` to enable custom parsing.                                               |
| `max_entries`    | **Required** | Maximum number of schedule entries supported by the device.                                     |
| `min_amount`     | **Required** | Minimum amount that can be dispensed.                                                           |
| `max_amount`     | **Required** | Maximum amount that can be dispensed.                                                           |
| `step_amount`    | **Required** | Step size for the amount to dispense.                                                           |
| `status_map`     | **Required** | A mapping of status codes to their corresponding states.                                        |
| `status_pattern` | **Required** | A regex pattern to extract schedule details from the `entity` state. Named groups are required. |

#### Complete Device Configuration Example

Here's a complete example of custom device parsing configuration:

```yaml
type: custom:dispenser-schedule-card
entity: sensor.my_custom_feeder_schedule
switch: switch.my_feeder_schedule_enable
actions:
  add: esphome.my_feeder_add_feed
  edit: esphome.my_feeder_edit_feed
  remove: esphome.my_feeder_remove_feed
  toggle: esphome.my_feeder_toggle_feed
device:
  type: custom
  max_entries: 8
  min_amount: 1
  max_amount: 20
  step_amount: 1
  status_map:
    0: dispensed
    1: failed
    2: pending
    3: dispensing
    4: My Custom State
  status_pattern: "(?<id>[0-9]),(?<hour>[0-9]{1,2}),(?<minute>[0-9]{1,2}),(?<amount>[0-9]{1,2}),(?<status>[0-9]),?"
unit_of_measurement:
  one: portion
  other: portions
alternate_unit:
  unit_of_measurement: g
  conversion_factor: 5
  approximate: true
display:
  failed:
    color: var(--error-color)
    icon: mdi:alert-circle
  My Custom State:
    color: hotpink
    icon: mdi:scale
    label: Custom Status
```

#### `status_map` Details

The `status_map` defines how status codes from the `entity` state are
interpreted. In the example above:

- `0: dispensed` - Status code `0` maps to the `dispensed` state.
- `1: failed` - Status code `1` maps to the `failed` state.
- `2: pending` - Status code `2` maps to the `pending` state.
- `3: dispensing` - Status code `3` maps to the `dispensing` state.
- `4: My Custom State` - Status code `4` maps to a custom state.

Mapping to any of the following states is automatically translated in the
supported languages (case sensitive):

- `dispensed`, `dispensing`, `pending`, `failed`, `skipped`, `disabled`, `unknown`.

Custom labels can be configured via the [`display` option](#display-customization)

#### `status_pattern` Details

The `status_pattern` uses a regex to extract schedule details from the `entity` state. Named groups are required for the following fields:

- `id`: The entry index.
- `hour`: The hour of the schedule (23h format).
- `minute`: The minute of the schedule.
- `amount`: The amount to dispense (portions, grams, etc.).
- `status`: The status code of the schedule entry.

**Example using Xiaomi format:** The [Xiaomi Smart Pet Feeder](#xiaomi-smart-pet-feeder-mmggfeederfi1) uses this pattern:

```regex
(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<amount>[0-9]{1,3}),(?<status>[0-9]{1,3}),?
```

Applied to the entity state `0,10,30,5,0,1,12,0,10,255`, this extracts:

- Entry 0: `id=0`, `hour=10`, `minute=30`, `amount=5`, `status=0`
- Entry 1: `id=1`, `hour=12`, `minute=0`, `amount=10`, `status=255`

### Display Customization

You can customize the display of specific statuses using the `display` option.
Each status can have the following properties:

| Name    | Required   | Description                                                                    |
| ------- | ---------- | ------------------------------------------------------------------------------ |
| `color` | _Optional_ | CSS color value to use for the status.                                         |
| `icon`  | _Optional_ | Icon to display for the status. Uses Material Design Icons (e.g., `mdi:icon`). |
| `label` | _Optional_ | The text label for the status, overriding any default translation.             |

For example:

```yaml
display:
  failed:
    color: var(--success-color)
    label: Task failed successfully
  My Custom State:
    color: hotpink
    icon: mdi:scale
```

This will display the `failed` status in the `--success-color` of the home
assistant theme and the label "Task failed successfully", and the custom state
`My Custom State`, in hot pink with the `mdi:scale` icon.

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
