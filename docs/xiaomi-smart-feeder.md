# Xiaomi Smart Pet Feeder (`mmgg.feeder.fi1`)

[← Back to main README](../README.md)

This page covers the `device.type: xiaomi-smart-feeder` adapter. It targets
the Xiaomi Smart Pet Feeder (`mmgg.feeder.fi1`) running ESPHome firmware
with the [esphome-miot](https://github.com/dhewg/esphome-miot/blob/main/config/mmgg.feeder.fi1.yaml)
component.

> **Note**
> Feeders running the original (stock) firmware are **not** supported —
> much of the schedule logic is handled in the cloud rather than on the
> device itself.

## Minimal YAML

```yaml
type: custom:dispenser-schedule-card
device:
  type: xiaomi-smart-feeder
  entity: sensor.feeder_raw_feed_plan
  switch: switch.feeder_feeding_schedule
  actions:
    add: esphome.feeder_add_scheduled_feed
    edit: esphome.feeder_edit_scheduled_feed
    remove: esphome.feeder_remove_scheduled_feed
```

## Configuration

| Name      | Required     | Description                                                                                             |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `type`    | **Required** | Must be `xiaomi-smart-feeder`.                                                                          |
| `entity`  | **Required** | Sensor or text entity holding the schedule (see [Schedule format](#schedule-format) below).             |
| `switch`  | _Optional_   | Switch entity for the global on/off toggle.                                                             |
| `actions` | _Optional_   | Service calls for adding, editing, removing, and toggling individual entries — see [Actions](#actions). |

### Actions

| Action   | Required arguments               | Notes                                                                    |
| -------- | -------------------------------- | ------------------------------------------------------------------------ |
| `add`    | `id`, `hour`, `minute`, `amount` | `portions` is also accepted as a synonym for `amount` (legacy).          |
| `edit`   | `id`, `hour`, `minute`, `amount` | Same legacy synonym.                                                     |
| `remove` | `id`                             |                                                                          |
| `toggle` | `id`                             | Server-side toggle — the called service flips the entry's enabled state. |

## Capabilities

- Up to 10 entries.
- Amount range: 1–30 portions, step 1.
- Per-entry toggle (when `actions.toggle` is set).
- Global on/off (when `switch` is set).
- No weekly schedule, today-skip, per-entry labels, or calling sound.

## Schedule format

The entity state follows this comma-separated format:

```
[id],[hour],[minute],[amount],[status]
```

Where:

- `id` — entry index (0–9)
- `hour` — dispense hour (0–23)
- `minute` — dispense minute (0–59)
- `amount` — portions to dispense (1–30)
- `status` — current state code: `0` (dispensed), `1` (failed), `254` (dispensing), `255` (pending)

Multiple entries are concatenated. For example:

```
0,10,30,5,0,1,12,0,10,255
```

represents two entries:

- Entry 0: 10:30, dispense 5 portions, already dispensed.
- Entry 1: 12:00, dispense 10 portions, pending.

## Under the hood

This adapter is a thin wrapper around the generic [custom device](custom.md)
type with hardcoded values for the maximum number of entries, the amount
range, the regex above, and the four-key status map. Advanced users can
achieve the same result with `device.type: custom` directly.
