# Custom devices

[← Back to main README](../README.md)

`device.type: custom` is a generic adapter for any device or integration
that exposes its schedule as a regex-parseable entity state. Use it when no
purpose-built adapter exists, or as a starting point for new integrations.

This page also covers the included [DIY ESPHome blueprint](#diy-esphome-blueprint).

## Contents

- [Configuration](#configuration)
- [Computed statuses](#computed-statuses)
- [Complete example](#complete-example)
- [`status_map`](#status_map)
- [`status_pattern`](#status_pattern)
- [Native status keys](#native-status-keys)
- [Other limitations](#other-limitations)
- [DIY ESPHome blueprint](#diy-esphome-blueprint)

## Configuration

| Name             | Required     | Description                                                                                     |
| ---------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `type`           | **Required** | Must be `custom`.                                                                               |
| `entity`         | **Required** | Sensor or text entity holding the schedule string.                                              |
| `max_entries`    | **Required** | Maximum number of schedule entries supported by the device.                                     |
| `min_amount`     | **Required** | Minimum amount that can be dispensed.                                                           |
| `max_amount`     | **Required** | Maximum amount that can be dispensed.                                                           |
| `step_amount`    | **Required** | Step size for the amount.                                                                       |
| `status_map`     | **Required** | List of `"<code> -> <status>"` strings — see [`status_map`](#status_map).                       |
| `status_pattern` | **Required** | Regex with named groups for parsing the entity state — see [`status_pattern`](#status_pattern). |
| `switch`         | _Optional_   | Single switch entity_id for the global on/off toggle.                                           |
| `actions`        | _Optional_   | Service calls for adding, editing, removing, and toggling entries — see [Actions](#actions).    |

### Actions

| Action   | Required arguments               | Notes                                                                                |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `add`    | `id`, `hour`, `minute`, `amount` | Legacy `portions` is auto-detected as a synonym for `amount` if the service uses it. |
| `edit`   | `id`, `hour`, `minute`, `amount` | Same legacy auto-detection.                                                          |
| `remove` | `id`                             |                                                                                      |
| `toggle` | `id`                             | Server-side toggle — the called service flips the entry's enabled state itself.      |

### `switch`

A single entity_id string. The card calls the appropriate service for the
domain (`switch.turn_on` / `switch.turn_off` for `switch.*` entities,
`homeassistant.turn_on` / `homeassistant.turn_off` for everything else).

## Computed statuses

The card derives two extra statuses for clarity:

**`skipped`** — assumed when:

- the entry's status is `pending`, and
- the current Home Assistant time is later than the dispense time.

This indicates an entry was not dispensed due to external factors (loss of
power, schedule disabled, etc.) — but not a failure of the device itself.

**`disabled`** — assumed when:

- the entry's status is `pending`, and
- the dispense time is in the future, and
- a `switch` is configured, and
- the `switch` is off.

This indicates that future entries will not run because the schedule is
currently turned off.

## Complete example

```yaml
type: custom:dispenser-schedule-card
device:
  type: custom
  entity: sensor.my_custom_feeder_schedule
  switch: switch.my_feeder_schedule_enable
  actions:
    add: esphome.my_feeder_add_feed
    edit: esphome.my_feeder_edit_feed
    remove: esphome.my_feeder_remove_feed
    toggle: esphome.my_feeder_toggle_feed
  max_entries: 8
  min_amount: 1
  max_amount: 20
  step_amount: 1
  status_map:
    - "0 -> dispensed"
    - "1 -> failed"
    - "2 -> pending"
    - "3 -> dispensing"
    - "4 -> My Custom State"
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

## `status_map`

Maps the raw status codes from the entity state to either one of the card's
[canonical statuses](../README.md#display-customization) (`dispensed`,
`dispensing`, `pending`, `failed`, `skipped`, `disabled`, `unknown`) or to a
custom name.

The format is a YAML list of `"<code> -> <status>"` strings:

```yaml
status_map:
  - "0 -> dispensed"
  - "1 -> failed"
  - "2 -> pending"
  - "3 -> dispensing"
  - "4 -> My Custom State"
```

Codes that map to a canonical status get the card's built-in icon, color,
and translated label. Codes that map to anything else are surfaced as
[native status keys](#native-status-keys).

## `status_pattern`

A regex with named groups for parsing the entity state. The following named
groups are required:

- `id` — the entry index.
- `hour` — the hour (24-hour).
- `minute` — the minute.
- `amount` — the amount to dispense.
- `status` — the status code, looked up in `status_map`.

The pattern is applied repeatedly with the global flag, so multiple entries
can be packed into a single entity state. Up to `max_entries` matches are
processed.

Example regex (matches the Xiaomi `mmgg.feeder.fi1` state format):

```regex
(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<amount>[0-9]{1,3}),(?<status>[0-9]{1,3}),?
```

Applied to the entity state `0,10,30,5,0,1,12,0,10,255`, this extracts:

- Entry 0: `id=0`, `hour=10`, `minute=30`, `amount=5`, `status=0`
- Entry 1: `id=1`, `hour=12`, `minute=0`, `amount=10`, `status=255`

## Native status keys

When a `status_map` entry maps a code to a value that isn't one of the
canonical statuses (e.g. `"4 -> My Custom State"`), the card:

- Treats the entry's canonical status as `none` (no built-in icon or color).
- Sets `data-native-status="My Custom State"` on the row, so stylesheets can
  target it directly.
- Uses the raw value as the row's secondary label.

The presentation can be overridden through the card's `display` option:

```yaml
display:
  My Custom State:
    color: hotpink
    icon: mdi:scale
    label: Custom Status
```

See the [Display customization](../README.md#display-customization) section
of the main README for the full overrides API.

## Other limitations

- Custom devices have no concept of a weekly schedule — every entry is
  treated as applying today, with `skipped` and `disabled` computed
  unconditionally based on past-due time and `switch` state.
- Per-entry labels and calling-sound options are not available for custom
  devices.

## DIY ESPHome blueprint

The repository ships an [ESPHome configuration example](dispenser-blueprint.yaml)
implementing a 10-entry schedule entirely on-device, compatible with this
card. (The schedule grammar matches `mmgg.feeder.fi1`, so you can plug it in
under either `device.type: custom` or the built-in
[`xiaomi-smart-feeder`](xiaomi-smart-feeder.md) adapter.)

Use it as a starting point — or an enhancement — for your own DIY
cat / dog / bird / fish feeders, or any other generic dispenser that needs
offline or battery-powered scheduling.

The blueprint mirrors the original Xiaomi feeder behaviour; for a real-world
reference configuration, see [xiaomi-smart-feeder.md](xiaomi-smart-feeder.md).

> **Note**
> The blueprint may not be the best way to handle on-device schedules,
> especially as ESPHome matures and gains new features over time.
