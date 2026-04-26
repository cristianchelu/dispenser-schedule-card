# PetKit feeders

[← Back to main README](../README.md)

PetKit feeders (such as the Fresh Element and YumShare lines) are
compatible with this card through the
[Jezza34000/homeassistant_petkit](https://github.com/Jezza34000/homeassistant_petkit)
custom integration, in **display-only** mode, using `device.type: custom`.

> **Note**
> Schedule editing and toggling is not supported for PetKit. The
> integration does not expose write actions matching the card's contract.
> Leave `actions` and `switch` unset.

## Configuration

Configure as a [custom device](custom.md). Point `entity` at the
`raw_distribution_data` sensor exposed by the PetKit integration, and use a
`status_pattern` and `status_map` that match its state format.

The PetKit integration's wiki publishes a recommended, ready-to-paste
configuration — including `status_pattern`, `status_map`, and the matching
`display` overrides for the various PetKit-specific statuses
(`dispensed_schedule`, `dispensed_remote`, `dispensed_local`, `cancelled`,
`skipped`, `error`, …):

[Recommended Cards → Schedule Card for Feeders](https://github.com/Jezza34000/homeassistant_petkit/wiki/Recommended-Cards#-schedule-card-for-feeders)

That page also lists the currently compatible feeder models. If your feeder
doesn't expose a `raw_distribution_data` sensor, the integration does not
yet support it for this card.

See the [Custom devices](custom.md) docs for the full field reference.
