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
 *    - 単色: d12 >= 4
 *    - 2色 : d12 <= 2 かつ d23 >= 4
 *    - 3色 : d12 <= 2 かつ d23 <= 2 かつ d34 >= 4
 * 4. 曖昧ケース
 *    - 差が 3 のケースは strongCount / hitCount を参考にする
 *    - なお曖昧なら、複合色側（1色より2色、2色より3色）を優先する
 */

import { COLORS, FRIENDLY_RELATIONS, ENEMY_RELATIONS } from "../config/constants.js";

/**
 * 結果型
 * @typedef {"mono" | "dual" | "tri"} ResultType
 */

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
    s1, s2, s3, s4, s5,
    d12: s1 - s2,
    d23: s2 - s3,
    d34: s3 - s4,
  };
}

/**
 * 2色候補の曖昧ケース補助判定
 * 差が3のときに strong / hit を見る
 *
 * @param {Array<{color:string,total:number,strongCount:number,hitCount:number}>} rankedColors
 * @returns {boolean}
 */
export function shouldLeanDual(rankedColors) {
  const first = rankedColors[0];
  const second = rankedColors[1];
  const third = rankedColors[2];

  if (!first || !second) {
    return false;
  }

  const pairStrong = (first?.strongCount ?? 0) + (second?.strongCount ?? 0);
  const pairHit = (first?.hitCount ?? 0) + (second?.hitCount ?? 0);
  const thirdStrong = third?.strongCount ?? 0;
  const thirdHit = third?.hitCount ?? 0;

  if (pairStrong > thirdStrong + 1) return true;
  if (pairHit > thirdHit + 1) return true;

  return true;
}

/**
 * 3色候補の曖昧ケース補助判定
 * 差が3のときは 3色側をやや優先する
 *
 * @param {Array<{color:string,total:number,strongCount:number,hitCount:number}>} rankedColors
 * @returns {boolean}
 */
export function shouldLeanTri(rankedColors) {
  const first = rankedColors[0];
  const second = rankedColors[1];
  const third = rankedColors[2];
  const fourth = rankedColors[3];

  const triStrong = (first?.strongCount ?? 0) + (second?.strongCount ?? 0) + (third?.strongCount ?? 0);
  const triHit = (first?.hitCount ?? 0) + (second?.hitCount ?? 0) + (third?.hitCount ?? 0);
  const fourthStrong = fourth?.strongCount ?? 0;
  const fourthHit = fourth?.hitCount ?? 0;

  if (triStrong > fourthStrong + 1) return true;
  if (triHit > fourthHit + 1) return true;

  return true;
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

  // 明確な単色
  if (gaps.d12 >= 4) {
    const colors = [top1];
    return {
      type: "mono",
      colors,
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        reason: "d12 >= 4 により 1位が明確に突出しているため単色判定。",
      },
    };
  }

  // 明確な2色
  if (gaps.d12 <= 2 && gaps.d23 >= 4) {
    const colors = [top1, top2];
    const dualKind = isFriendlyDual(colors) ? "friendly" : isEnemyDual(colors) ? "enemy" : "other";
    return {
      type: "dual",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        dualKind,
        reason: "d12 <= 2 かつ d23 >= 4 により上位2色がまとまり、3位以下と分断しているため2色判定。",
      },
    };
  }

  // 明確な3色
  if (gaps.d12 <= 2 && gaps.d23 <= 2 && gaps.d34 >= 4) {
    const colors = [top1, top2, top3];
    const triKind = getTriadKind(colors);
    return {
      type: "tri",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        triKind,
        reason: "d12 <= 2 かつ d23 <= 2 かつ d34 >= 4 により上位3色がまとまり、4位以下と分断しているため3色判定。",
      },
    };
  }

  // 曖昧ケース1: 1位と2位の差が3
  if (gaps.d12 == 3) {
    const colors = [top1, top2];
    const dualKind = isFriendlyDual(colors) ? "friendly" : isEnemyDual(colors) ? "enemy" : "other";
    return {
      type: "dual",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        dualKind,
        reason: "d12 == 3 の曖昧ケース。単色より複合色を優先し、2色側へ倒した。",
      },
    };
  }

  // 曖昧ケース2: 上位3色が近く、3位と4位の差が3
  if (gaps.d12 <= 2 && gaps.d23 <= 2 && gaps.d34 == 3) {
    const colors = [top1, top2, top3];
    const triKind = getTriadKind(colors);
    return {
      type: "tri",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        triKind,
        reason: "d34 == 3 の曖昧ケース。2色より3色を優先し、3色側へ倒した。",
      },
    };
  }

  // その他の中間ケース:
  // 複合色を優先する思想に従い、
  // 上位3色のまとまりが少しでも見えるなら 3色へ、
  // そうでなければ 2色へ倒す
  if (gaps.d12 <= 2 && gaps.d23 <= 3) {
    const colors = [top1, top2, top3];
    const triKind = getTriadKind(colors);
    return {
      type: "tri",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        triKind,
        reason: "中間ケース。上位3色の近さを優先して3色判定。",
      },
    };
  }

  if (gaps.d12 <= 3) {
    const colors = [top1, top2];
    const dualKind = isFriendlyDual(colors) ? "friendly" : isEnemyDual(colors) ? "enemy" : "other";
    return {
      type: "dual",
      colors: normalizeColors(colors),
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        dualKind,
        reason: "中間ケース。上位2色の近さを優先して2色判定。",
      },
    };
  }

  // 最終フォールバック
  {
    const colors = [top1];
    return {
      type: "mono",
      colors,
      resultKey: buildResultKey(colors),
      gaps,
      meta: {
        reason: "最終フォールバックとして単色判定。",
      },
    };
  }
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
