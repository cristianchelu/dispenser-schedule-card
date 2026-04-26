# Xiaomi Smart Pet Feeder 2

[← Back to main README](../README.md)

This page covers the `device.type: xiaomi-smart-feeder-2` adapter. It works
with the Xiaomi Smart Pet Feeder 2 via the official
[Xiaomi Home integration](https://github.com/XiaoMi/ha_xiaomi_home).

## Minimal YAML

```yaml
type: custom:dispenser-schedule-card
device:
  type: xiaomi-smart-feeder-2
  entity: text.my_feeder_schedule
```

The schedule is read from and written to the same `text` entity exposed by
the integration — no separate switch, action services, or device id are
needed.

## Configuration

| Name     | Required     | Description                                      |
| -------- | ------------ | ------------------------------------------------ |
| `type`   | **Required** | Must be `xiaomi-smart-feeder-2`.                 |
| `entity` | **Required** | The `text.*` entity holding the schedule string. |

## Capabilities

- Full schedule control (add / edit / remove / toggle individual entries).
- Up to 10 entries.
- Amount range: 1–15 portions, step 1.
- Global on/off (encoded inside the same entity state).
- No weekly schedule, today-skip, per-entry labels, or calling sound.

Because the device only reports `enabled` or `disabled` per entry, the card
does not show `dispensed` / `failed` / `skipped` statuses for this device —
past-due pending entries simply remain unstyled.

## Schedule format (power-user note)

The card writes back to the same `text` entity using `text.set_value`. The
state grammar is:

```
[<g>,<HHMMAASS>,<HHMMAASS>,...]
```

- `g` — global toggle: `0` (off) or `1` (on).
- Each subsequent token is 8 digits split as `HH`, `MM`, `AA`, `SS`:
  - `HH` (00–23) — hour
  - `MM` (00–59) — minute
  - `AA` (01–15) — amount
  - `SS` — status: `01` enabled, `00` disabled

For example, `[1,08300501,18001000]` represents two entries — one at 08:30
for 5 portions (enabled), one at 18:00 for 10 portions (disabled) — with
the schedule globally on.
