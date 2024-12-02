# Dispenser Schedule Card

> A very simple card to view and control dispenser schedules for the 
> [Home Assistant](https://www.home-assistant.io/) Lovelace / Grace UI


[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)


![Screenshot of dispenser schedule card](docs/screenshot.png)

## Installation

### Using HACS

You can add this repository as a custom HACS repo by following the official guide:
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

|  Name                 |   Required   | Description                                                                                                                             |
|-----------------------|--------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `entity`              | **Required** | An entity_id in the `sensor` domain containing the schedule                                                                             |
| `switch`              |  *Optional*  | An entity_id in the `switch` domain containing the on/off toggle for the schedule.                                                      |
| `actions`             |  *Optional*  | `add`, `edit`, and `remove` actions                                                                                                     |
| `editable`            |  *Optional*  | Whether the schedule is editable. `always`, `toggle`, or `never`.<br><br> Default `toggle` if `actions` are defined, otherwise `never`. |
| `unit_of_measurement` |  *Optional*  | Optional override for the unit label. <br><br> Default `portions`.                                                                      |
| `alternate_unit`      |  *Optional*  | Configuration to display a secondary unit of measurement, with a conversion factor.                                                     |

#### `actions` options
|  Name    |  Required  | Description                                                                                   |
|----------|------------|-----------------------------------------------------------------------------------------------|
| `add`    | *Optional* | action_id that accepts `id`, `hour`, `minute`, `amount` `*`.                                     |
| `edit`   | *Optional* | action_id that accepts `id`, `hour`, `minute`, `amount` `*`.                                     |
| `remove` | *Optional* | action_id that accepts `id`.                                                                  |

`*` - `portions` is also accepted as a parameter instead of `amount`.

#### `alternate_unit` options

|  Name                 |   Required   | Description                                                                    |
|-----------------------|--------------|--------------------------------------------------------------------------------|
| `unit_of_measurement` | **Required** | Label for the secondary unit of measurement                                    |
| `conversion_factor`   | **Required** | Number to multiply the primary amount by                                       |
| `approximate`         |  *Optional*  | Whether the alternate unit is an approximation. Adds a `~` prefix to the value |


## Compatibility

### Xiaomi Smart Pet Feeder (`mmgg.feeder.fi1`)

This card was originally created for the Xiaomi Smart Pet Feeder running 
ESPHome firmware with the [esphome-miot](https://github.com/dhewg/esphome-miot/blob/main/config/mmgg.feeder.fi1.yaml) 
component and offers full support for it.

Feeders with the original firmware are *NOT* currently supported as much of the
logic is not handled by the device itself.

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

### General points

For a device to be compatible with this card, `entity` state currently must
contain a string with the the structure
`[int id],[int hour],[int minute],[int amount],[int status]`, as a 
comma-separated list, where `id` is the entry index, `hour` is the 23h formatted
hour at which to dispense, `minute` is the minute of the hour at which to dispense, `amount`
is the amount to dispense (portions, grams, etc) and `status` is an 
integer with the following meaning:
 -   0 - dispensed successfully for today
 -   1 - dispense failed for today (lack of food, food stuck, etc)
 - 254 - currently dispensing
 - 255 - pending for today

Example:

`0,10,30,5,0,1,12,0,10,255`

- entry 0: 10:30 dispense 5 portions, dispensed successfully.
- entry 1: 12:00 dispense 10 portions, pending.

`skipped` status is assumed by the card when the schedule entry is still status
`pending` but the current time is greater than the dispense time.

A customizable option using Jinja2 templates to extract the schedule from
arbitrary entities is also under consideration.


## Languages

Translations are currently available for the following languages:

- Català (Catalan)
- English
- Français (French)
- Italiano (Italian)
- Română (Romanian)
- Türkçe (Turkish)

Contributions are welcome!