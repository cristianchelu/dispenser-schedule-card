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

export const PETKIT_NATIVE_STATUSES = Object.keys(PETKIT_NATIVE_ICONS);

/** The card's own look for a PetKit native status; the editor shows it as the default. */
export function getPetkitNativeStatusDisplay(
  key: string
): NativeStatusDisplay | undefined {
  const icon = PETKIT_NATIVE_ICONS[key];
  if (!icon) return undefined;
  const label = localize(`status_petkit.${key}`) ?? key;
  return { key, label, icon };
}

/** PetKit skin over OpenPetBowl: the native status catalog, nothing more. */
export default class PetKitDevice extends OpenPetBowlDevice<PetKitDeviceConfig> {
  getNativeStatusDisplay(
    entry: ScheduleEntry
  ): NativeStatusDisplay | undefined {
    const key = this.nativeStatusByKey.get(entry.key);
    return key ? getPetkitNativeStatusDisplay(key) : undefined;
  }
}
