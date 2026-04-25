/**
 * diagnosis.js
 *
 * 役割:
 * - scoring.js の rankedColors を受け取り、
 *   単色 / 2色 / 3色 のどれを返すか判定する
 * - 結果キー（例: "white", "white_blue", "white_blue_green"）を作る
 * - 判定に使った差分や理由も返す
 *
 * 判定方針:
 * 1. total 降順・strongCount 降順・hitCount 降順で並んだ rankedColors を前提にする
 * 2. 上位差分を見る
 *    - d12 = s1 - s2
 *    - d23 = s2 - s3
 *    - d34 = s3 - s4
 * 3. 基本ルール
 *    - 単色: d12 >= 8
 *    - 3色 : d12 <= 3 かつ d23 <= 3
 *    - 2色 : d12 <= 5 かつ d23 >= 4
 * 4. 中間ケース
 *    - d12 が 6〜7 の場合は、単色にせず2色へ倒す
 *    - 2色と3色で迷う場合は、上位3色が近ければ3色を優先する
 *
 * 設計意図:
 * - 4点差程度の上振れでは単色にしない
 * - 単色は「かなり明確に1色が突出した場合」に限定する
 * - 診断結果として、単色 / 2色 / 3色がすべて自然に出るようにする
 */

import { COLORS, FRIENDLY_RELATIONS, ENEMY_RELATIONS } from "../config/constants.js";

/**
 * 結果型
 * @typedef {"mono" | "dual" | "tri"} ResultType
 */

export const MONO_THRESHOLD = 8;
export const TRI_CLOSE_GAP = 3;
export const DUAL_CLOSE_GAP = 5;
export const DUAL_SEPARATION_GAP = 4;

/**
 * 色配列が友好2色かどうかを判定
 * 例: white + blue は true, white + black は false
 *
 * @param {string[]} colors
 * @returns {boolean}
 */
export function isFriendlyDual(colors) {
  if (!Array.isArray(colors) || colors.length !== 2) return false;
  const [a, b] = colors;
  const friendly = FRIENDLY_RELATIONS[a] ?? [];
  return friendly.includes(b);
}

/**
 * 色配列が対抗2色かどうかを判定
 *
 * @param {string[]} colors
 * @returns {boolean}
 */
export function isEnemyDual(colors) {
  if (!Array.isArray(colors) || colors.length !== 2) return false;
  const [a, b] = colors;
  const enemies = ENEMY_RELATIONS[a] ?? [];
  return enemies.includes(b);
}

/**
 * 3色が「扇」か「楔」かを返す
 *
 * ルール:
 * - 中心色の友好2色なら shard（扇）
 * - 中心色の対抗2色なら wedge（楔）
 *
 * 返せない場合は "other"
 *
 * @param {string[]} colors
 * @returns {"shard" | "wedge" | "other"}
 */
export function getTriadKind(colors) {
  if (!Array.isArray(colors) || colors.length !== 3) return "other";

  for (const center of colors) {
    const others = colors.filter((color) => color !== center);
    const friendly = FRIENDLY_RELATIONS[center] ?? [];
    const enemies = ENEMY_RELATIONS[center] ?? [];

    const isShard = others.length === 2 && others.every((color) => friendly.includes(color));
    if (isShard) return "shard";

    const isWedge = others.length === 2 && others.every((color) => enemies.includes(color));
    if (isWedge) return "wedge";
  }

  return "other";
}

/**
 * 固定順で色を正規化
 * 結果キーの揺れを防ぐ
 *
 * @param {string[]} colors
 * @returns {string[]}
 */
export function normalizeColors(colors) {
  const colorIndex = Object.fromEntries(COLORS.map((color, index) => [color, index]));
  return [...colors].sort((a, b) => colorIndex[a] - colorIndex[b]);
}

/**
 * 結果キーを作る
 * 例:
 * - ["white"] => "white"
 * - ["white", "blue"] => "white_blue"
 * - ["white", "blue", "green"] => "white_blue_green"
 *
 * @param {string[]} colors
 * @returns {string}
 */
export function buildResultKey(colors) {
  return normalizeColors(colors).join("_");
}

/**
 * 差分を計算する
 *
 * @param {Array<{color:string,total:number,strongCount:number,hitCount:number}>} rankedColors
 * @returns {{
 *   s1:number, s2:number, s3:number, s4:number, s5:number,
 *   d12:number, d23:number, d34:number
 * }}
 */
export function computeScoreGaps(rankedColors) {
  const values = rankedColors.map((item) => item.total);
  const [s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0] = values;

  return {
    s1,
    s2,
    s3,
    s4,
    s5,
    d12: s1 - s2,
    d23: s2 - s3,
    d34: s3 - s4,
  };
}

/**
 * 診断結果オブジェクトを作る
 *
 * @param {ResultType} type
 * @param {string[]} colors
 * @param {ReturnType<typeof computeScoreGaps>} gaps
 * @param {{
 *   reason: string,
 *   dualKind?: "friendly" | "enemy" | "other",
 *   triKind?: "shard" | "wedge" | "other"
 * }} meta
 * @returns {{
 *   type: ResultType,
 *   colors: string[],
 *   resultKey: string,
 *   gaps: ReturnType<typeof computeScoreGaps>,
 *   meta: {
 *     dualKind?: "friendly" | "enemy" | "other",
 *     triKind?: "shard" | "wedge" | "other",
 *     reason: string
 *   }
 * }}
 */
export function buildDiagnosisResult(type, colors, gaps, meta) {
  const normalizedColors = normalizeColors(colors);

  return {
    type,
    colors: normalizedColors,
    resultKey: buildResultKey(normalizedColors),
    gaps,
    meta,
  };
}

/**
 * 2色結果を作る
 *
 * @param {string[]} colors
 * @param {ReturnType<typeof computeScoreGaps>} gaps
 * @param {string} reason
 * @returns {ReturnType<typeof buildDiagnosisResult>}
 */
export function buildDualResult(colors, gaps, reason) {
  const dualKind = isFriendlyDual(colors) ? "friendly" : isEnemyDual(colors) ? "enemy" : "other";

  return buildDiagnosisResult("dual", colors, gaps, {
    dualKind,
    reason,
  });
}

/**
 * 3色結果を作る
 *
 * @param {string[]} colors
 * @param {ReturnType<typeof computeScoreGaps>} gaps
 * @param {string} reason
 * @returns {ReturnType<typeof buildDiagnosisResult>}
 */
export function buildTriResult(colors, gaps, reason) {
  const triKind = getTriadKind(colors);

  return buildDiagnosisResult("tri", colors, gaps, {
    triKind,
    reason,
  });
}

/**
 * 単色・2色・3色を判定する
 *
 * @param {Array<{color:string,total:number,strongCount:number,hitCount:number}>} rankedColors
 * @returns {{
 *   type: ResultType,
 *   colors: string[],
 *   resultKey: string,
 *   gaps: {
 *     s1:number, s2:number, s3:number, s4:number, s5:number,
 *     d12:number, d23:number, d34:number
 *   },
 *   meta: {
 *     dualKind?: "friendly" | "enemy" | "other",
 *     triKind?: "shard" | "wedge" | "other",
 *     reason: string
 *   }
 * }}
 */
export function diagnoseFromRankedColors(rankedColors) {
  if (!Array.isArray(rankedColors) || rankedColors.length < 3) {
    throw new Error("diagnoseFromRankedColors: rankedColors must contain at least 3 items.");
  }

  const gaps = computeScoreGaps(rankedColors);

  const top1 = rankedColors[0]?.color;
  const top2 = rankedColors[1]?.color;
  const top3 = rankedColors[2]?.color;

  if (!top1 || !top2 || !top3) {
    throw new Error("diagnoseFromRankedColors: top colors are missing.");
  }

  const topTwoColors = [top1, top2];
  const topThreeColors = [top1, top2, top3];

  // 1. 明確な単色
  // 4点差では単色が出すぎるため、8点差以上に引き上げる。
  if (gaps.d12 >= MONO_THRESHOLD) {
    return buildDiagnosisResult("mono", [top1], gaps, {
      reason: `d12 >= ${MONO_THRESHOLD} により、1位が明確に突出しているため単色判定。`,
    });
  }

  // 2. 明確な3色
  // 上位3色が近い場合は、2色より3色を優先する。
  // 例: 20 / 18 / 16 / 10 のような形。
  if (gaps.d12 <= TRI_CLOSE_GAP && gaps.d23 <= TRI_CLOSE_GAP) {
    return buildTriResult(
      topThreeColors,
      gaps,
      `d12 <= ${TRI_CLOSE_GAP} かつ d23 <= ${TRI_CLOSE_GAP} により、上位3色が近いため3色判定。`,
    );
  }

  // 3. 明確な2色
  // 1位と2位がある程度近く、2位と3位が離れていれば2色。
  // 例: 20 / 16 / 10 / 9 のような形。
  if (gaps.d12 <= DUAL_CLOSE_GAP && gaps.d23 >= DUAL_SEPARATION_GAP) {
    return buildDualResult(
      topTwoColors,
      gaps,
      `d12 <= ${DUAL_CLOSE_GAP} かつ d23 >= ${DUAL_SEPARATION_GAP} により、上位2色がまとまり3位以下と分断しているため2色判定。`,
    );
  }

  // 4. 単色未満だが1位がそこそこ強いケース
  // d12 が 6〜7 程度なら、単色にはせず上位2色にする。
  // これで「少し強いだけの単色」を抑える。
  if (gaps.d12 >= DUAL_CLOSE_GAP + 1) {
    return buildDualResult(
      topTwoColors,
      gaps,
      `d12 は ${MONO_THRESHOLD} 未満だが ${DUAL_CLOSE_GAP + 1} 以上。単色にはせず、1位と2位の2色判定。`,
    );
  }

  // 5. 2位と3位が近い中間ケース
  // 1位・2位・3位が完全に密着していなくても、3位が十分近ければ3色へ倒す。
  // 例: 20 / 15 / 12 / 9 のような形。
  if (gaps.d23 <= TRI_CLOSE_GAP) {
    return buildTriResult(
      topThreeColors,
      gaps,
      `d23 <= ${TRI_CLOSE_GAP} により、2位と3位が近いため3色判定。`,
    );
  }

  // 6. それ以外は2色
  // 単色閾値に届かず、3色としても近くないなら、上位2色を結果にする。
  return buildDualResult(
    topTwoColors,
    gaps,
    "単色閾値に届かず、上位3色のまとまりも弱いため2色判定。",
  );
}

/**
 * buildScoreSummary の返り値を直接受けて診断する
 *
 * @param {{
 *   rankedColors: Array<{color:string,total:number,strongCount:number,hitCount:number}>
 * }} summary
 * @returns {{
 *   type: ResultType,
 *   colors: string[],
 *   resultKey: string,
 *   gaps: {
 *     s1:number, s2:number, s3:number, s4:number, s5:number,
 *     d12:number, d23:number, d34:number
 *   },
 *   meta: {
 *     dualKind?: "friendly" | "enemy" | "other",
 *     triKind?: "shard" | "wedge" | "other",
 *     reason: string
 *   }
 * }}
 */
export function diagnoseFromSummary(summary) {
  if (!summary || !Array.isArray(summary.rankedColors)) {
    throw new Error("diagnoseFromSummary: summary.rankedColors is required.");
  }

  return diagnoseFromRankedColors(summary.rankedColors);
}

export default diagnoseFromSummary;
