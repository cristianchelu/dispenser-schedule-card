# PetKit feeders

[← Back to main README](../README.md)

This page covers the `device.type: petkit` adapter. PetKit feeders (Fresh
Element, YumShare, and similar models) work with the
[Jezza34000/homeassistant_petkit](https://github.com/Jezza34000/homeassistant_petkit)
custom integration in Home Assistant.

## Integration version

Use homeassistant_petkit `v1.25.0 (2026-04-17)` or newer.
For older releases, you can still use
`[device.type: custom](custom.md)` with the integration’s
`raw_distribution_data` string and a `status_pattern`, as in the
[PetKit integration wiki](https://github.com/Jezza34000/homeassistant_petkit/wiki).
That path does not include the weekly or dual-hopper editor.

## Minimal YAML

```yaml
type: custom:dispenser-schedule-card
device:
  type: petkit
  device_id: abc123def456...
```

The card needs your Home Assistant **device id** (see
[Configuration](#configuration)) and finds the schedule sensor automatically —
see [Discovery](#discovery) if that fails.

## Configuration

| Name        | Required     | Description                                                                                                                                                                               |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | **Required** | Must be `petkit`.                                                                                                                                                                         |
| `device_id` | **Required** | Home Assistant device id (trailing part of the device’s settings URL, e.g. `/config/devices/device/abc123def456…`). Without it, the card cannot find the schedule sensor or save changes. |
| `entity`    | _Optional_   | Override the auto-discovered `raw_distribution_data` sensor if discovery fails.                                                                                                           |

## Capabilities

| Capability                  | Supported | Notes                                                                                                     |
| --------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Read schedule               | Yes       | Up to 10 plan slots.                                                                                      |
| Add / edit / remove entries | Yes       | Replaces the full 7-day schedule in one step. **Requires** `device_id`.                                   |
| Toggle individual entry     | No        | The PetKit cloud API does not offer a per-entry on/off control like some other brands.                    |
| Global enable / disable     | No        | Not available in Home Assistant for this flow; use the PetKit app.                                        |
| Skip / un-skip for today    | No        | Not available from the card; use the app for one-off changes to today’s run.                              |
| Weekly schedule             | Yes       | Choose which weekdays each entry runs; at least one day per entry. “Never repeat” is not used for PetKit. |
| Per-entry label             | Yes       | Optional. If you leave it blank, the card sends a default `Feed HH:MM` name (the API requires a name).    |

**Dual hoppers (D4S, D4SH):** the card shows two amount fields (blue / orange)
when the integration reports `amount1` / `amount2` on the schedule, or when
the device is registered as D4S/D4SH in Home Assistant and the schedule is
still empty (first-time setup).

Amounts are **portions**: typically 1–10 per side on dual hoppers, 1–50 on
many single-hopper models, as allowed by the device. Use the card’s
`[unit_of_measurement](../README.md#card-configuration)` and
`[alternate_unit](../README.md#alternate_unit-options)` to show grams or other
units if you like.

## Discovery

With `device_id` set, the card looks for an entity on that device that has a
`feed_daily_list` attribute (the `raw_distribution_data` sensor from the PetKit
integration).

If you wish to override this, set `entity` by hand, for example:

```yaml
device:
  type: petkit
  device_id: ...
  entity: sensor.your_feeder_raw_distribution_data
```

## Native status keys

The integration reports live feed results in a short state on
`raw_distribution_data`. The card maps these to
[canonical statuses](../README.md#display-customization) and to the native keys
below for finer-grained `display` overrides.

| Native key               | Meaning                                        | Default canonical mapping |
| ------------------------ | ---------------------------------------------- | ------------------------- |
| `dispensed_schedule`     | Fed on schedule                                | `dispensed`               |
| `dispensed_remote`       | Fed from the app                               | `dispensed`               |
| `dispensed_local`        | Fed from the feeder                            | `dispensed`               |
| `cancelled`              | Will be skipped for today.                     | `skipped`                 |
| `skipped_surpluscontrol` | Skipped because bowl was full (SurplusControl) | `skipped`                 |

Override any of these through the card's `display` map:

```yaml
display:
  cancelled:
    icon: mdi:close-circle
```

See the [Display customization](../README.md#display-customization) section  
of the main README for the full overrides API.
