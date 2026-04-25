/**
 * questionSelector.js
 *
 * 色別グループ選出版
 *
 * 仕様:
 * - 15問中、各プライマリカラーから3問ずつ選出する
 * - group_white / group_blue / group_black / group_red / group_green は
 *   それぞれ該当 primaryColor の質問だけを持つ前提
 * - 同じ質問IDは選出しない
 * - 最後に15問をシャッフルして表示順をランダム化する
 *
 * 注意:
 * - scores には一切触れない
 * - 出題バランスは primaryColor で保証する
 */

import { COLORS, DRAW_COUNT } from "../config/constants.js";

const GROUP_ID_BY_COLOR = {
  white: "group_white",
  blue: "group_blue",
  black: "group_black",
  red: "group_red",
  green: "group_green",
};

/**
 * Fisher-Yates shuffle
 * 元配列を壊さずに新配列を返す。
 *
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffleArray(array) {
  const cloned = [...array];

  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  return cloned;
}

/**
 * DRAW_COUNT と COLORS から、各色の選出数を決める。
 * 通常は 15問 / 5色 = 各3問。
 *
 * DRAW_COUNT が5で割り切れない場合は、端数をランダムな色に1問ずつ配る。
 *
 * @returns {Record<string, number>}
 */
export function buildPrimaryColorQuotas() {
  const base = Math.floor(DRAW_COUNT / COLORS.length);
  const remainder = DRAW_COUNT % COLORS.length;

  const quotas = Object.fromEntries(COLORS.map((color) => [color, base]));

  const shuffledColors = shuffleArray(COLORS);
  for (let i = 0; i < remainder; i += 1) {
    quotas[shuffledColors[i]] += 1;
  }

  return quotas;
}

/**
 * 質問を primaryColor ごとに分類する。
 * groupId が group_white 等であることも検証する。
 *
 * @param {Array<object>} questions
 * @returns {Record<string, Array<object>>}
 */
export function groupQuestionsByPrimaryColor(questions) {
  const grouped = Object.fromEntries(COLORS.map((color) => [color, []]));

  for (const question of questions) {
    const primaryColor = question?.primaryColor;

    if (!COLORS.includes(primaryColor)) {
      throw new Error(
        `groupQuestionsByPrimaryColor: invalid primaryColor. id=${question?.id}, primaryColor=${primaryColor}`,
      );
    }

    const expectedGroupId = GROUP_ID_BY_COLOR[primaryColor];
    if (question.groupId !== expectedGroupId) {
      throw new Error(
        `groupQuestionsByPrimaryColor: invalid groupId. id=${question?.id}, expected=${expectedGroupId}, actual=${question.groupId}`,
      );
    }

    grouped[primaryColor].push(question);
  }

  return grouped;
}

/**
 * 指定色の山札から必要数だけ選ぶ。
 *
 * @param {object[]} candidates
 * @param {number} quota
 * @param {string} color
 * @returns {object[]}
 */
export function pickQuestionsForColor(candidates, quota, color) {
  if (candidates.length < quota) {
    throw new Error(
      `pickQuestionsForColor: not enough questions for ${color}. required=${quota}, actual=${candidates.length}`,
    );
  }

  return shuffleArray(candidates).slice(0, quota);
}

/**
 * 主色分布を数える。
 * デバッグ・検証用。
 *
 * @param {object[]} questions
 * @returns {Record<string, number>}
 */
export function countPrimaryColors(questions) {
  const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));

  for (const question of questions) {
    if (question?.primaryColor && counts[question.primaryColor] !== undefined) {
      counts[question.primaryColor] += 1;
    }
  }

  return counts;
}

/**
 * groupId 分布を数える。
 * デバッグ・検証用。
 *
 * @param {object[]} questions
 * @returns {Record<string, number>}
 */
export function countGroups(questions) {
  const counts = {};

  for (const question of questions) {
    const groupId = question?.groupId ?? "undefined_group";
    counts[groupId] = (counts[groupId] ?? 0) + 1;
  }

  return counts;
}

/**
 * メイン関数
 *
 * @param {object[]} questions
 * @returns {object[]}
 */
export function selectQuestions(questions) {
  if (!Array.isArray(questions)) {
    throw new TypeError("selectQuestions: questions must be an array.");
  }

  if (questions.length < DRAW_COUNT) {
    throw new Error(
      `selectQuestions: question pool is too small. required=${DRAW_COUNT}, actual=${questions.length}`,
    );
  }

  const quotas = buildPrimaryColorQuotas();
  const grouped = groupQuestionsByPrimaryColor(questions);

  const selected = [];

  for (const color of COLORS) {
    const picked = pickQuestionsForColor(grouped[color], quotas[color], color);
    selected.push(...picked);
  }

  const selectedIds = new Set(selected.map((question) => question.id));
  if (selectedIds.size !== selected.length) {
    throw new Error("selectQuestions: duplicated question id detected.");
  }

  if (selected.length !== DRAW_COUNT) {
    throw new Error(
      `selectQuestions: invalid selected count. required=${DRAW_COUNT}, actual=${selected.length}`,
    );
  }

  return shuffleArray(selected);
}

export default selectQuestions;
