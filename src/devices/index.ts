import CustomDevice from "./CustomDevice";
import XiaomiSmartFeeder from "./XiaomiSmartFeeder";

const Devices = {
    'custom': CustomDevice,
    'xiaomi-smart-feeder': XiaomiSmartFeeder,
} as const;
export type DeviceType = keyof typeof Devices;

export default Devices;