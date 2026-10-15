import type { Messages } from "./zh-CN";
import { zhTW } from "./zh-TW";

// Hong Kong Traditional falls back to the Taiwan catalog. Add a key here
// only when Hong Kong wording must differ.
export const zhHKOverrides: Partial<Messages> = {};

export const zhHK: Messages = { ...zhTW, ...zhHKOverrides };
