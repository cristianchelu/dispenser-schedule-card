import { Device } from "../types";
import XiaomiSmartFeeder from "./XiaomiSmartFeeder";

const Devices = {
    'xiaomi-smart-feeder': XiaomiSmartFeeder
} as const;

export default Devices;