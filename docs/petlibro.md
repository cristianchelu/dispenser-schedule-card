# PetLibro dry feeders

[← Back to main README](../README.md)

This page covers the `device.type: petlibro` adapter. PetLibro dry feeders
are supported via the [jjjonesjr33/petlibro](https://github.com/jjjonesjr33/petlibro)
custom integration.

## Minimal YAML

```yaml
type: custom:dispenser-schedule-card
device:
  type: petlibro
  device_id: abc123def456...
```

The card auto-discovers the schedule entity for the device — see
[Discovery](#discovery) below if it can't find the right one.

## Configuration

| Name        | Required     | Description                                                                                                                                                                     |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | **Required** | Must be `petlibro`.                                                                                                                                                             |
| `device_id` | **Required** | Home Assistant device id (the trailing segment of the device's settings page URL, e.g. `/config/devices/device/abc123def456…`). Without it, the card runs in display-only mode. |
| `entity`    | _Optional_   | Override the auto-discovered schedule `binary_sensor` if discovery fails — see [Discovery](#discovery).                                                                         |
| `switch`    | _Optional_   | Override the global on/off control — see [Global toggle](#global-toggle).                                                                                                       |

## Capabilities

| Capability                | Supported | Notes                                                                    |
| ------------------------- | --------- | ------------------------------------------------------------------------ |
| Read schedule             | Yes       | Up to 10 plans.                                                          |
| Add / edit / remove plans | Yes       | Requires `device_id`.                                                    |
| Toggle individual plan    | Yes       | Requires `device_id`.                                                    |
| Global enable / disable   | Yes       | See [Global toggle](#global-toggle).                                     |
| Skip / un-skip for today  | Yes       | One-off skip without disabling the recurring plan. Requires `device_id`. |
| Weekly schedule           | Yes       | See [Weekly schedule](#weekly-schedule).                                 |
| Per-plan label            | Yes       | 1–20 characters, no whitespace.                                          |
| Per-plan calling sound    | Yes       | Lure sound on/off per plan.                                              |

Amounts are read in raw portions, with a range of 1–48 per plan. Use the
card's [`unit_of_measurement`](../README.md#card-configuration) and
[`alternate_unit`](../README.md#alternate_unit-options) options to display
grams, ounces, etc.

## Weekly schedule

Each plan can repeat on any combination of weekdays. The editor offers two
shortcuts in addition to selecting individual days:

- **Every day** — plan runs every day of the week. This is also what gets
  persisted when no day is explicitly selected.
- **Never repeat** — plan does not run on any weekday until re-enabled.
  This is what gets persisted when every day is explicitly de-selected.

## Global toggle

By default — when `device_id` is set and the schedule entity has been found —
the card uses the schedule entity's state for the global on/off toggle, and
calls `petlibro.toggle_feeding_schedule` to change it.

The `switch` field can override this. It accepts either:

A single switch entity:

```yaml
device:
  type: petlibro
  device_id: ...
  switch: switch.my_feeder_feeding_schedule
```

…or a compound shape with a separate state entity and on/off buttons:

```yaml
device:
  type: petlibro
  device_id: ...
  switch:
    state_entity: binary_sensor.my_feeder_feeding_schedule
    on_button: button.my_feeder_enable_feeding_plan
    off_button: button.my_feeder_disable_feeding_plan
```

### Today-only override

The integration also exposes a today-only schedule sensor and matching
enable/disable buttons. Pointing the compound shape at those redirects the
card's global toggle so it only affects today's plans, without disabling the
recurring schedule:

```yaml
device:
  type: petlibro
  device_id: ...
  switch:
    state_entity: binary_sensor.my_feeder_today_s_feeding_schedule
    on_button: button.my_feeder_enable_all_plans_today
    off_button: button.my_feeder_disable_all_plans_today
```

Already-dispensed entries are left untouched; only future entries for today
are skipped.

## Discovery

When `device_id` is set, the card finds the schedule entity by scanning all
entities on that device for one whose state has a `schedule` attribute.

If discovery fails (or selects the wrong entity), set `entity` explicitly:

```yaml
device:
  type: petlibro
  device_id: ...
  entity: binary_sensor.my_feeder_feeding_schedule
```

## Native status keys

PetLibro plans surface two integration-specific sub-statuses on top of the
[canonical statuses](../README.md#display-customization):

| Native key      | Meaning                                                               | Default canonical mapping |
| --------------- | --------------------------------------------------------------------- | ------------------------- |
| `to_be_skipped` | Plan will be skipped for today only (un-skippable from the row menu). | `skipped`                 |
| `state_5`       | Reported by the integration with no documented meaning.               | `unknown`                 |

A plan that has already dispensed today and is currently disabled is shown
with a distinct success-coloured indicator so it doesn't look like a regular
disabled entry.

Override either presentation through the card's `display` map:

```yaml
display:
  to_be_skipped:
    icon: mdi:ghost
    label: Skipping today
```

See the [Display customization](../README.md#display-customization) section
of the main README for the full overrides API.
