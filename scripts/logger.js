import { MODULE_ID } from "./constants.js";

export class Logger {
  static log(...args) {
    console.log(`%c${MODULE_ID}`, "color: #47d1a9; font-weight: bold;", ...args);
  }

  static warn(...args) {
    console.warn(`%c${MODULE_ID}`, "color: #ffb84d; font-weight: bold;", ...args);
  }

  static error(...args) {
    console.error(`%c${MODULE_ID}`, "color: #ff6666; font-weight: bold;", ...args);
  }

  static debug(...args) {
    console.debug(`%c${MODULE_ID}`, "color: #8888ff; font-weight: bold;", ...args);
  }
}