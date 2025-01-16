import CustomDevice from "./CustomDevice";

export default class XiaomiSmartFeeder extends CustomDevice {
  constructor(config: any, hass: any) {
    super(
      {
        ...config,
        device: {
          type: "custom",
          status_pattern:
            "(?<id>[0-9]),(?<hour>[0-9]{1,3}),(?<minute>[0-9]{1,3}),(?<amount>[0-9]{1,3}),(?<status>[0-9]{1,3}),?",
          status_map: [
            "0 -> dispensed",
            "1 -> failed",
            "254 -> dispensing",
            "255 -> pending",
          ],
          max_entries: 10,
          max_amount: 30,
          min_amount: 1,
          step_amount: 1,
        },
      },
      hass
    );
  }
}
