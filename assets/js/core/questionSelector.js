/**
 * questionSelector.js
 *
 * 偏り除去版
 *
 * 修正方針:
 * - 色ごとの抽出順を固定しない
 * - round-robin で 1周ずつ各色から選ぶ
 * - 各ラウンドで色順をシャッフルする
 * - groupId / axis 制約は維持する
 *
 * これにより、
 * white -> blue -> black -> red -> green の固定順で
 * 先手有利になる問題をかなり抑える。
 */

import { COLORS, DRAW_COUNT } from "../config/constants.js";

/**
 * Fisher-Yates shuffle
 * 元配列を壊さずに新配列を返す
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
 * primaryColor ごとに問題をグループ化する
 * @param {Array<object>} questions
 * @returns {Record<string, Array<object>>}
 */
export function groupQuestionsByPrimaryColor(questions) {
  const grouped = Object.fromEntries(COLORS.map((color) => [color, []]));

  for (const question of questions) {
    if (!question?.primaryColor) continue;
    if (!grouped[question.primaryColor]) {
      grouped[question.primaryColor] = [];
    }
    grouped[question.primaryColor].push(question);
  }

  // 候補順自体も色ごとにシャッフルしておく
  for (const color of Object.keys(grouped)) {
    grouped[color] = shuffleArray(grouped[color]);
  }

  return grouped;
}

/**
 * 指定した質問を今の選抜結果に追加してよいか判定する
 * @param {object} question
 * @param {object[]} selected
 * @param {Map<string, number>} axisCounts
 * @param {Set<string>} usedGroupIds
 * @param {number} maxSameAxis
 * @param {boolean} allowGroupDuplicate
 * @returns {boolean}
 */
export function canSelectQuestion(
  question,
  selected,
  axisCounts,
  usedGroupIds,
  maxSameAxis,
  allowGroupDuplicate = false,
) {
  if (!question) return false;

  if (!allowGroupDuplicate && question.groupId && usedGroupIds.has(question.groupId)) {
    return false;
  }

  const axis = question.axis ?? "unspecified_axis";
  const currentAxisCount = axisCounts.get(axis) ?? 0;
  if (currentAxisCount >= maxSameAxis) {
    return false;
  }

  const alreadySelected = selected.some((item) => item.id === question.id);
  if (alreadySelected) {
    return false;
  }

  return true;
}

/**
 * 問題を選抜状態に追加する
 * @param {object} question
 * @param {object[]} selected
 * @param {Map<string, number>} axisCounts
 * @param {Set<string>} usedGroupIds
 */
export function registerQuestion(question, selected, axisCounts, usedGroupIds) {
  selected.push(question);

  const axis = question.axis ?? "unspecified_axis";
  axisCounts.set(axis, (axisCounts.get(axis) ?? 0) + 1);

  if (question.groupId) {
    usedGroupIds.add(question.groupId);
  }
}

/**
 * 各色の割当数を決める
 * 例: DRAW_COUNT=15, COLORS=5 なら 3 問ずつ
 * 端数がある場合も偏りが固定色に乗らないよう、
 * remainder の配布先は毎回シャッフルする。
 *
 * @returns {Record<string, number>}
 */
export function buildPrimaryColorQuotas() {
  const base = Math.floor(DRAW_COUNT / COLORS.length);
  const remainder = DRAW_COUNT % COLORS.length;

  /** @type {Record<string, number>} */
  const quotas = Object.fromEntries(COLORS.map((color) => [color, base]));

  const shuffledColors = shuffleArray(COLORS);
  for (let i = 0; i < remainder; i += 1) {
    quotas[shuffledColors[i]] += 1;
  }

  return quotas;
}

/**
 * 1色分の候補から 1問だけ選ぶ
 * 条件は phase に応じて変える
 *
 * @param {object[]} candidates
 * @param {object[]} selected
 * @param {Map<string, number>} axisCounts
 * @param {Set<string>} usedGroupIds
 * @param {{maxSameAxis:number, allowGroupDuplicate:boolean}} phase
 * @returns {object | null}
 */
export function pickOneCandidate(
  candidates,
  selected,
  axisCounts,
  usedGroupIds,
  phase,
) {
  for (const question of candidates) {
    if (
      canSelectQuestion(
        question,
        selected,
        axisCounts,
        usedGroupIds,
        phase.maxSameAxis,
        phase.allowGroupDuplicate,
      )
    ) {
      return question;
    }
  }

  return null;
}

/**
 * quota を round-robin で埋める
 * 各ラウンドで色順をシャッフルするため、特定色の先手有利を抑えやすい。
 *
 * @param {Record<string, object[]>} grouped
 * @param {Record<string, number>} quotas
 * @param {object[]} selected
 * @param {Map<string, number>} axisCounts
 * @param {Set<string>} usedGroupIds
 */
export function pickQuestionsRoundRobin(
  grouped,
  quotas,
  selected,
  axisCounts,
  usedGroupIds,
) {
  /** @type {Array<{maxSameAxis:number, allowGroupDuplicate:boolean}>} */
  const phases = [
    { maxSameAxis: 2, allowGroupDuplicate: false },
    { maxSameAxis: 3, allowGroupDuplicate: false },
    { maxSameAxis: 3, allowGroupDuplicate: true },
  ];

  for (const phase of phases) {
    let progress = true;

    while (progress) {
      progress = false;

      const colorOrder = shuffleArray(COLORS);

      for (const color of colorOrder) {
        if ((quotas[color] ?? 0) <= 0) continue;

        const picked = pickOneCandidate(
          grouped[color] ?? [],
          selected,
          axisCounts,
          usedGroupIds,
          phase,
        );

        if (picked) {
          registerQuestion(picked, selected, axisCounts, usedGroupIds);
          quotas[color] -= 1;
          progress = true;
        }

        if (selected.length >= DRAW_COUNT) return;
      }

      const remainingQuota = Object.values(quotas).some((value) => value > 0);
      if (!remainingQuota) return;
    }
  }
}

/**
 * まだ足りない分を全候補から補完する
 *
 * @param {object[]} questions
 * @param {object[]} selected
 * @param {Map<string, number>} axisCounts
 * @param {Set<string>} usedGroupIds
 */
export function fillRemainingQuestions(
  questions,
  selected,
  axisCounts,
  usedGroupIds,
) {
  const shuffled = shuffleArray(questions);

  /** @type {Array<{maxSameAxis:number, allowGroupDuplicate:boolean}>} */
  const phases = [
    { maxSameAxis: 3, allowGroupDuplicate: false },
    { maxSameAxis: 4, allowGroupDuplicate: false },
    { maxSameAxis: 4, allowGroupDuplicate: true },
    { maxSameAxis: Number.POSITIVE_INFINITY, allowGroupDuplicate: true },
  ];

  for (const phase of phases) {
    for (const question of shuffled) {
      if (selected.length >= DRAW_COUNT) return;

      if (
        canSelectQuestion(
          question,
          selected,
          axisCounts,
          usedGroupIds,
          phase.maxSameAxis,
          phase.allowGroupDuplicate,
        )
      ) {
        registerQuestion(question, selected, axisCounts, usedGroupIds);
      }
    }

    if (selected.length >= DRAW_COUNT) return;
  }
}

/**
 * 主色分布を数える
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
 * axis 分布を数える
 * @param {object[]} questions
 * @returns {Record<string, number>}
 */
export function countAxes(questions) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const question of questions) {
    const axis = question?.axis ?? "unspecified_axis";
    counts[axis] = (counts[axis] ?? 0) + 1;
  }
  return counts;
}

/**
 * メイン関数
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

  const grouped = groupQuestionsByPrimaryColor(questions);
  const quotas = buildPrimaryColorQuotas();

  /** @type {object[]} */
  const selected = [];
  const axisCounts = new Map();
  const usedGroupIds = new Set();

  pickQuestionsRoundRobin(
    grouped,
    quotas,
    selected,
    axisCounts,
    usedGroupIds,
  );

  if (selected.length < DRAW_COUNT) {
    fillRemainingQuestions(questions, selected, axisCounts, usedGroupIds);
  }

  if (selected.length < DRAW_COUNT) {
    throw new Error(
      `selectQuestions: could not satisfy draw count. required=${DRAW_COUNT}, actual=${selected.length}`,
    );
  }

  return shuffleArray(selected).slice(0, DRAW_COUNT);
}

export default selectQuestions;
