/**
 * app.js
 *
 * 対応内容:
 * - 開始画面
 * - 名前入力
 * - 結果画面
 * - Xシェア
 * - result クエリ付きURLで結果ページを直接表示
 *   例: ?result=white_blue
 */

import { questions } from "./data/questions.js";
import { results } from "./data/results/index.js";
import selectQuestions from "./core/questionSelector.js";
import buildScoreSummary from "./core/scoring.js";
import diagnoseFromSummary from "./core/diagnosis.js";

const state = {
  userName: "",
  selectedQuestions: [],
  currentIndex: 0,
  answers: {},
  scoreSummary: null,
  diagnosis: null,
  previewResultKey: null,
};

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`app.js: required element not found: #${id}`);
  }
  return el;
}

function clearElement(el) {
  el.innerHTML = "";
}

function createButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function createParagraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function createList(items) {
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  return ul;
}

function getDisplayUserName() {
  const name = String(state.userName ?? "").trim();
  return name || "あなた";
}

function buildResultUrl(resultKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("result", resultKey);
  url.searchParams.delete("name");
  return url.toString();
}

function replaceResultUrl(resultKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("result", resultKey);
  url.searchParams.delete("name");
  window.history.replaceState({}, "", url.toString());
}

function clearResultUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("result");
  url.searchParams.delete("name");
  window.history.replaceState({}, "", url.toString());
}

function getDisplayResultName(resultKey = null) {
  const key = resultKey ?? state.diagnosis?.resultKey ?? state.previewResultKey;
  return buildColorLabelFromKey(key);
}

function buildShareText() {
  const displayName = getDisplayUserName();
  const resultKey = state.diagnosis?.resultKey;
  const resultName = getDisplayResultName(resultKey);
  const resultData = results[resultKey] ?? {};
  const shareUrl = buildResultUrl(resultKey);

  const lines = [
    `${displayName}さんの #DRSKカラーパイ診断`,
    `結果は「${resultName}」！`,
    "",
  ];

  if (Array.isArray(resultData.strengths) && resultData.strengths.length > 0) {
    for (const strength of resultData.strengths.slice(0, 3)) {
      lines.push(`・${strength}`);
    }
  } else if (resultData.shortDescription) {
    lines.push(resultData.shortDescription);
  }

  lines.push("");
  lines.push("⬇色の詳細・診断はこちら⬇");
  lines.push(shareUrl);

  return lines.join("\n");
}

function openXShare() {
  const text = buildShareText();
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.location.href = url;
}

function renderTitle() {
  const titleEl = getElement("title");
  titleEl.textContent = "DRSKカラーパイ診断";
  titleEl.style.cursor = "pointer";

  titleEl.onclick = () => {
    state.userName = "";
    state.selectedQuestions = [];
    state.currentIndex = 0;
    state.answers = {};
    state.scoreSummary = null;
    state.diagnosis = null;
    state.previewResultKey = null;
    clearResultUrl();
    renderApp();
  };
}

function renderProgress() {
  const progressEl = document.getElementById("progress");
  if (!progressEl) return;

  // 質問中のみ表示
  if (
    state.selectedQuestions.length > 0 &&
    state.currentIndex < state.selectedQuestions.length
  ) {
    progressEl.textContent = `質問 ${state.currentIndex + 1} / ${state.selectedQuestions.length}`;
    progressEl.style.display = "block";
    return;
  }

  // それ以外は非表示
  progressEl.style.display = "none";
}

function handleAnswer(questionId, optionId) {
  state.answers[questionId] = optionId;
  state.currentIndex += 1;

  if (state.currentIndex >= state.selectedQuestions.length) {
    finishDiagnosis();
  } else {
    renderApp();
  }
}

function renderStartScreen() {
  const questionArea = getElement("question-area");
  const resultArea = getElement("result-area");

  questionArea.hidden = false;
  resultArea.hidden = true;

  clearElement(questionArea);
  clearElement(resultArea);

  const title = document.createElement("h2");
  title.textContent = "DRSKカラーパイ診断へようこそ！";
  questionArea.appendChild(title);

  const intro = document.createElement("p");
  intro.innerHTML = `
    DRSKカラーパイ診断は、思考や行動を「白・青・黒・赤・緑」の5つの色で捉える診断です。<br>
    質問に答えることで、あなたがどの価値観を強く持っているのかが明らかになるかも!?<br><br>
    名前を入力して「診断を始める」を押してください。未入力でも始められます。
  `;
  questionArea.appendChild(intro);

  const input = document.createElement("input");
  input.type = "text";
  input.id = "user-name-input";
  input.placeholder = "名前を入力";
  input.value = state.userName;
  input.className = "name-input";
  questionArea.appendChild(input);

  const button = createButton("診断を始める", () => {
  state.userName = input.value.trim();
  startDiagnosis();
});

button.className = "choice-button start-button";
questionArea.appendChild(button);
}

function renderQuestion() {
  const questionArea = getElement("question-area");
  const resultArea = getElement("result-area");

  questionArea.hidden = false;
  resultArea.hidden = true;

  clearElement(questionArea);
  clearElement(resultArea);

  const question = state.selectedQuestions[state.currentIndex];
  if (!question) return;

  const questionTitle = document.createElement("h2");
  questionTitle.textContent = question.text ?? "質問文がありません";
  questionArea.appendChild(questionTitle);

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "options-wrap";

  const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);

  for (const option of shuffledOptions) {
    const button = createButton(option.text ?? "未設定の選択肢", () => {
      handleAnswer(question.id, option.id);
    });
    button.className = "choice-button";
    optionsWrap.appendChild(button);
  }

  questionArea.appendChild(optionsWrap);
}

function renderResultContent(resultArea, resultKey, scoreSummary = null, diagnosis = null, isPreview = false) {
  const resultData = results[resultKey];
  const displayName = getDisplayUserName();
  const displayResultName = getDisplayResultName(resultKey);

  const title = document.createElement("h2");
  title.textContent = "診断結果";
  resultArea.appendChild(title);

  const lead = document.createElement("h3");
  lead.textContent = `${displayName}さんのカラーパイは「${displayResultName}」でした！`;
  resultArea.appendChild(lead);

  if (resultData) {
    if (resultData.catchcopy) {
      const catchcopyEl = document.createElement("p");
      catchcopyEl.textContent = resultData.catchcopy;
      resultArea.appendChild(catchcopyEl);
    }

    if (resultData.shortDescription) {
      resultArea.appendChild(createParagraph(resultData.shortDescription));
    }

    if (resultData.longDescription) {
      resultArea.appendChild(createParagraph(resultData.longDescription));
    }

    if (Array.isArray(resultData.strengths) && resultData.strengths.length > 0) {
      const strengthsTitle = document.createElement("h4");
      strengthsTitle.textContent = "強み";
      resultArea.appendChild(strengthsTitle);
      resultArea.appendChild(createList(resultData.strengths));
    }

    if (Array.isArray(resultData.cautions) && resultData.cautions.length > 0) {
      const cautionsTitle = document.createElement("h4");
      cautionsTitle.textContent = "注意点";
      resultArea.appendChild(cautionsTitle);
      resultArea.appendChild(createList(resultData.cautions));
    }
  } else {
    resultArea.appendChild(createParagraph(`resultKey: ${resultKey} に対応する結果文が未登録。`));
  }

  if (isPreview) {
    const playButton = createButton("この診断で遊ぶ", () => {
      state.previewResultKey = null;
      clearResultUrl();
      renderApp();
    });
    playButton.className = "restart-button";
    resultArea.appendChild(playButton);
    return;
  }

  const shareButton = createButton("Xでシェアする", () => {
    openXShare();
  });
  shareButton.className = "share-button";
  resultArea.appendChild(shareButton);

  if (scoreSummary && diagnosis) {
    const debugTitle = document.createElement("h3");
    debugTitle.textContent = "開発用データ";
    resultArea.appendChild(debugTitle);

    resultArea.appendChild(createParagraph(`resultKey: ${diagnosis.resultKey}`));
    resultArea.appendChild(createParagraph(`type: ${diagnosis.type}`));
    resultArea.appendChild(createParagraph(`colors: ${diagnosis.colors.join(", ")}`));
    resultArea.appendChild(createParagraph(`reason: ${diagnosis.meta.reason}`));

    const rankingTitle = document.createElement("h4");
    rankingTitle.textContent = "集計結果";
    resultArea.appendChild(rankingTitle);

    const list = document.createElement("ol");
    for (const item of scoreSummary.rankedColors) {
      const li = document.createElement("li");
      li.textContent = `${item.color} total=${item.total} strong=${item.strongCount} hit=${item.hitCount}`;
      list.appendChild(li);
    }
    resultArea.appendChild(list);
  }

  const restartButton = createButton("もう一度診断する", () => {
    state.selectedQuestions = [];
    state.currentIndex = 0;
    state.answers = {};
    state.scoreSummary = null;
    state.diagnosis = null;
    state.previewResultKey = null;
    clearResultUrl();
    renderApp();
  });
  restartButton.className = "restart-button";
  resultArea.appendChild(restartButton);
}

function renderPreviewResult() {
  const questionArea = getElement("question-area");
  const resultArea = getElement("result-area");

  questionArea.hidden = true;
  resultArea.hidden = false;

  clearElement(questionArea);
  clearElement(resultArea);

  renderResultContent(resultArea, state.previewResultKey, null, null, true);
}

function renderResult() {
  const questionArea = getElement("question-area");
  const resultArea = getElement("result-area");

  questionArea.hidden = true;
  resultArea.hidden = false;

  clearElement(questionArea);
  clearElement(resultArea);

  if (!state.scoreSummary || !state.diagnosis) return;

  renderResultContent(
    resultArea,
    state.diagnosis.resultKey,
    state.scoreSummary,
    state.diagnosis,
    false,
  );

  console.log("scoreSummary", state.scoreSummary);
  console.log("diagnosis", state.diagnosis);
  console.log("resultData", results[state.diagnosis.resultKey]);
}

function finishDiagnosis() {
  state.scoreSummary = buildScoreSummary(state.selectedQuestions, state.answers);
  state.diagnosis = diagnoseFromSummary(state.scoreSummary);
  replaceResultUrl(state.diagnosis.resultKey);
  renderApp();
}

function renderApp() {
  renderTitle();
  renderProgress();

  if (state.previewResultKey) {
    renderPreviewResult();
    return;
  }

  if (state.selectedQuestions.length === 0) {
    renderStartScreen();
    return;
  }

  if (state.currentIndex >= state.selectedQuestions.length) {
    renderResult();
  } else {
    renderQuestion();
  }
}

function startDiagnosis() {
  state.previewResultKey = null;
  state.selectedQuestions = selectQuestions(questions);
  state.currentIndex = 0;
  state.answers = {};
  state.scoreSummary = null;
  state.diagnosis = null;
  clearResultUrl();
  renderApp();
}

function bootstrapFromUrl() {
  const url = new URL(window.location.href);
  const resultKey = url.searchParams.get("result");

  if (resultKey && results[resultKey]) {
    state.previewResultKey = resultKey;
  }
}

function bootstrap() {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("app.js: questions data is empty.");
  }

  bootstrapFromUrl();
  renderApp();
}

const COLOR_EMOJIS = {
  white: "🟨",
  blue: "🟦",
  black: "🟪",
  red: "🟥",
  green: "🟩",
};

const COLOR_NAMES = {
  white: "白",
  blue: "青",
  black: "黒",
  red: "赤",
  green: "緑",
};

function buildColorLabelFromKey(resultKey) {
  if (!resultKey) return "未確定";

  const colors = resultKey.split("_");
  const emojiPart = colors.map((color) => COLOR_EMOJIS[color] ?? "⬜").join("");
  const namePart = colors.map((color) => COLOR_NAMES[color] ?? color).join("");

  return `${emojiPart}${namePart}`;
}

window.addEventListener("DOMContentLoaded", bootstrap);
