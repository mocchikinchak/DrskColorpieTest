/**
 * scoring.js
 *
 * 偏り除去版
 *
 * 修正方針:
 * - total / strongCount / hitCount が完全同点のとき、
 *   COLORS 固定順で白を勝たせない
 * - 最終比較は「回答内容から作る deterministic hash」で行う
 *
 * これにより、
 * white -> blue -> black -> red -> green の固定タイブレークを除去する。
 */

import { COLORS } from "../config/constants.js";

/**
 * 空のスコアボードを作る
 * @returns {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>
 * }}
 */
export function createEmptyScoreBoard() {
  return {
    totals: Object.fromEntries(COLORS.map((color) => [color, 0])),
    strongCounts: Object.fromEntries(COLORS.map((color) => [color, 0])),
    hitCounts: Object.fromEntries(COLORS.map((color) => [color, 0])),
  };
}

/**
 * 問題内から optionId に一致する選択肢を探す
 * @param {object} question
 * @param {string} optionId
 * @returns {object | undefined}
 */
export function findOptionById(question, optionId) {
  if (!question || !Array.isArray(question.options)) return undefined;
  return question.options.find((option) => option.id === optionId);
}

/**
 * 単一選択肢の scores をスコアボードへ反映する
 *
 * ルール:
 * - 値 >= 1 なら hit_count を加算
 * - 値 >= 2 なら strong_count を加算
 *
 * @param {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>
 * }} board
 * @param {Record<string, number>} scores
 */
export function applyScoresToBoard(board, scores) {
  if (!scores || typeof scores !== "object") return;

  for (const [color, value] of Object.entries(scores)) {
    if (!COLORS.includes(color)) continue;
    if (typeof value !== "number" || Number.isNaN(value)) continue;

    board.totals[color] += value;

    if (value >= 1) {
      board.hitCounts[color] += 1;
    }

    if (value >= 2) {
      board.strongCounts[color] += 1;
    }
  }
}

/**
 * 回答データを集計する
 *
 * @param {object[]} questions
 * @param {Record<string, string>} answers
 * @returns {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>
 * }}
 */
export function scoreAnswers(questions, answers) {
  if (!Array.isArray(questions)) {
    throw new TypeError("scoreAnswers: questions must be an array.");
  }

  if (!answers || typeof answers !== "object") {
    throw new TypeError("scoreAnswers: answers must be an object.");
  }

  const board = createEmptyScoreBoard();

  for (const question of questions) {
    const questionId = question?.id;
    if (!questionId) continue;

    const selectedOptionId = answers[questionId];
    if (!selectedOptionId) continue;

    const selectedOption = findOptionById(question, selectedOptionId);
    if (!selectedOption) continue;

    applyScoresToBoard(board, selectedOption.scores);
  }

  return board;
}

/**
 * 回答内容から deterministic な文字列 seed を作る
 * 同じ回答なら同じ seed、違う回答なら違う seed になる。
 *
 * @param {Record<string, string>} answers
 * @returns {string}
 */
export function buildTieSeed(answers) {
  return Object.entries(answers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([questionId, optionId]) => `${questionId}:${optionId}`)
    .join("|");
}

/**
 * 簡易 hash
 * @param {string} value
 * @returns {number}
 */
export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 色ごとの集計を、判定しやすい配列形式に変換する
 *
 * @param {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>
 * }} board
 * @returns {Array<{
 *   color: string,
 *   total: number,
 *   strongCount: number,
 *   hitCount: number
 * }>}
 */
export function toRankedColorArray(board) {
  return COLORS.map((color) => ({
    color,
    total: board.totals[color] ?? 0,
    strongCount: board.strongCounts[color] ?? 0,
    hitCount: board.hitCounts[color] ?? 0,
  }));
}

/**
 * 色配列を順位順にソートする
 *
 * 比較順:
 * 1. total desc
 * 2. strongCount desc
 * 3. hitCount desc
 * 4. tieSeed + color から作る hash asc
 *
 * @param {Array<{
 *   color: string,
 *   total: number,
 *   strongCount: number,
 *   hitCount: number
 * }>} rankedColors
 * @param {string} tieSeed
 * @returns {Array<{
 *   color: string,
 *   total: number,
 *   strongCount: number,
 *   hitCount: number
 * }>}
 */
export function sortRankedColors(rankedColors, tieSeed = "") {
  return [...rankedColors].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.strongCount !== a.strongCount) return b.strongCount - a.strongCount;
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;

    const aHash = hashString(`${tieSeed}|${a.color}`);
    const bHash = hashString(`${tieSeed}|${b.color}`);
    return aHash - bHash;
  });
}

/**
 * scoreAnswers + toRankedColorArray + sortRankedColors をまとめて実行する
 *
 * @param {object[]} questions
 * @param {Record<string, string>} answers
 * @returns {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>,
 *   rankedColors: Array<{
 *     color: string,
 *     total: number,
 *     strongCount: number,
 *     hitCount: number
 *   }>,
 *   tieSeed: string
 * }}
 */
export function buildScoreSummary(questions, answers) {
  const board = scoreAnswers(questions, answers);
  const tieSeed = buildTieSeed(answers);
  const rankedColors = sortRankedColors(toRankedColorArray(board), tieSeed);

  return {
    ...board,
    tieSeed,
    rankedColors,
  };
}

/**
 * デバッグ用:
 * 集計結果を見やすい文字列にする
 *
 * @param {{
 *   totals: Record<string, number>,
 *   strongCounts: Record<string, number>,
 *   hitCounts: Record<string, number>,
 *   rankedColors?: Array<{
 *     color: string,
 *     total: number,
 *     strongCount: number,
 *     hitCount: number
 *   }>,
 *   tieSeed?: string
 * }} summary
 * @returns {string}
 */
export function formatScoreSummary(summary) {
  const ranked =
    summary.rankedColors ??
    sortRankedColors(toRankedColorArray(summary), summary.tieSeed ?? "");

  return ranked
    .map(
      (item, index) =>
        `${index + 1}. ${item.color} total=${item.total} strong=${item.strongCount} hit=${item.hitCount}`,
    )
    .join("\n");
}

export default buildScoreSummary;
