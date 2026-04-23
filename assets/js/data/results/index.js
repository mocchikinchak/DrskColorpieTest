import { monoResults } from "./mono.js";
import { dualResults } from "./dual.js";
import { triResults } from "./tri.js";

export const results = {
  ...monoResults,
  ...dualResults,
  ...triResults,
};

export default results;
