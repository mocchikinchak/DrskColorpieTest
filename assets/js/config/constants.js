export const COLORS = ["white", "blue", "black", "red", "green"];

export const COLOR_LABELS = {
  white: "白",
  blue: "青",
  black: "黒",
  red: "赤",
  green: "緑",
};

export const FRIENDLY_RELATIONS = {
  white: ["blue", "green"],
  blue: ["white", "black"],
  black: ["blue", "red"],
  red: ["black", "green"],
  green: ["red", "white"],
};

export const ENEMY_RELATIONS = {
  white: ["black", "red"],
  blue: ["red", "green"],
  black: ["white", "green"],
  red: ["white", "blue"],
  green: ["blue", "black"],
};

export const DRAW_COUNT = 15;
