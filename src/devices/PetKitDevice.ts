import { NativeStatusDisplay, ScheduleEntry } from "../types/common";
import localize from "../localization";
import OpenPetBowlDevice, {
  type OpenPetBowlDeviceConfig,
} from "./OpenPetBowlDevice";

export interface PetKitDeviceConfig extends OpenPetBowlDeviceConfig {
  type: "petkit";
}

const PETKIT_NATIVE_ICONS: Record<string, string> = {
  dispensed_schedule: "mdi:clock-check-outline",
  dispensed_remote: "mdi:cellphone-check",
  dispensed_local: "mdi:account-check",
  cancelled: "mdi:debug-step-over",
  surplus_skipped: "mdi:food-off",
  error: "mdi:alert-circle-outline",
  past_unknown: "mdi:help-circle-outline",
};

/** PetKit skin over OpenPetBowl: the native status catalog, nothing more. */
export default class PetKitDevice extends OpenPetBowlDevice<PetKitDeviceConfig> {
  getNativeStatusDisplay(
    entry: ScheduleEntry
  ): NativeStatusDisplay | undefined {
    const key = this.nativeStatusByKey.get(entry.key);
    if (!key) return undefined;
    const label = localize(`status_petkit.${key}`) ?? key;
    const icon = PETKIT_NATIVE_ICONS[key];
    return { key, label, ...(icon ? { icon } : {}) };
  }
}
