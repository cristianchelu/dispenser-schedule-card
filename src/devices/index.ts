import CustomDevice from "./CustomDevice";
import PetkitDevice from "./PetkitDevice";
import XiaomiSmartFeeder from "./XiaomiSmartFeeder";

const Devices = {
  "custom": CustomDevice,
  "petkit": PetkitDevice,
  "xiaomi-smart-feeder": XiaomiSmartFeeder,
} as const;
export type DeviceType = keyof typeof Devices;

export default Devices;
