(() => {
  "use strict";

  const SUPABASE_URL = "https://rbotgymyxqrsiarftjxz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_EXINY5MNhPKCUxJ30CWiaw_PvPmOg1l";
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/brain-battle`;

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const $ = (selector) => document.querySelector(selector);

  const state = {
    questions: [],
    questionIndex: 0,
    answers: [],
    selectedAnswer: null,
    playerName: "",
    teamId: "",
    teamName: "",
    attemptId: null,
    submitting: false,
  };

  const elements = {
    tabs: [...document.querySelectorAll("[data-view]")],
    playView: $("#playView"),
    leaderboardView: $("#leaderboardView"),
    setup: $("#setup"),
    setupForm: $("#setupForm"),
    playerName: $("#playerName"),
    quiz: $("#quiz"),
    questionCounter: $("#questionCounter"),
    progressBar: $("#progressBar"),
    questionText: $("#questionText"),
    answerOptions: $("#answerOptions"),
    quizMessage: $("#quizMessage"),
    nextButton: $("#nextButton"),
    result: $("#result"),
    resultTitle: $("#resultTitle"),
    resultScore: $("#resultScore"),
    resultTeam: $("#resultTeam"),
    playAgainButton: $("#playAgainButton"),
    viewScoresButton: $("#viewScoresButton"),
    pageMessage: $("#pageMessage"),
    teamLeaderboard: $("#teamLeaderboard"),
    individualLeaderboard: $("#individualLeaderboard"),
    refreshLeaderboard: $("#refreshLeaderboard"),
  };

  function showMessage(message, type = "") {
    elements.pageMessage.textContent = message;
    elements.pageMessage.className = type;
  }

  function showQuizMessage(message, type = "") {
    elements.quizMessage.textContent = message;
    elements.quizMessage.className = type;
  }

  async function callFunction(action, payload = {}) {
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;

    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }

    return result;
  }

  function showView(view) {
    const showLeaderboard = view === "leaderboard";

    elements.playView.hidden = showLeaderboard;
    elements.leaderboardView.hidden = !showLeaderboard;

    for (const tab of elements.tabs) {
      tab.setAttribute(
        "aria-selected",
        String(tab.dataset.view === view)
      );
    }

    if (showLeaderboard) loadLeaderboard();
  }

  function setBusy(button, busy, busyText = "Please wait…") {
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  async function loadTeams() {
    const result = await callFunction("teams");
    const teams = result.teams || [];

    if (
      teams.length !== 2 ||
      !teams.some((team) => team.name === "Boys") ||
      !teams.some((team) => team.name === "Girls")
    ) {
      throw new Error(
        "Boys and Girls teams are not configured. Please check the Supabase database."
      );
    }

    return teams;
  }

  async function startGame(event) {
    event.preventDefault();
    showMessage("");

    const playerName = elements.playerName.value.trim();
    const selectedTeam = elements.setupForm.querySelector(
      'input[name="team"]:checked'
    );

    if (!playerName || playerName.length > 40 || !selectedTeam) {
      showMessage("Enter your name and choose a team.", "error");
      return;
    }

    const submitButton = elements.setupForm.querySelector(
      'button[type="submit"]'
    );

    setBusy(submitButton, true, "Loading game…");

    try {
      const [teamList, questionResult] = await Promise.all([
        loadTeams(),
        callFunction("questions"),
      ]);

      const team = teamList.find(
        (item) => item.name === selectedTeam.value
      );
      const questions = questionResult.questions;

      if (
        !team ||
        !Array.isArray(questions) ||
        questions.length !== 10 ||
        questions.some(
          (question) =>
            typeof question.id !== "string" ||
            typeof question.question !== "string" ||
            !Array.isArray(question.options) ||
            question.options.length !== 4
        )
      ) {
        throw new Error("The game could not load valid questions or teams.");
      }

      state.playerName = playerName;
      state.teamId = team.id;
      state.teamName = team.name;
      state.attemptId = crypto.randomUUID();
      state.questions = questions;
      state.questionIndex = 0;
      state.answers = [];
      state.selectedAnswer = null;
      state.submitting = false;

      elements.setup.hidden = true;
      elements.result.hidden = true;
      elements.quiz.hidden = false;

      renderQuestion();
    } catch (error) {
      showMessage(error.message || "Could not start the game.", "error");
    } finally {
      setBusy(submitButton, false);
    }
  }

  function renderQuestion() {
    const question = state.questions[state.questionIndex];

    if (!question) return;

    state.selectedAnswer = null;

    elements.questionCounter.textContent =
      `Question ${state.questionIndex + 1} of ${state.questions.length}`;

    elements.progressBar.style.width =
      `${(state.questionIndex / state.questions.length) * 100}%`;

    elements.questionText.textContent = question.question;
    elements.answerOptions.replaceChildren();
    elements.nextButton.disabled = true;

    elements.nextButton.textContent =
      state.questionIndex === state.questions.length - 1
        ? "Submit answers"
        : "Next question";

    showQuizMessage("");

    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-option";
      button.setAttribute("aria-pressed", "false");

      const letter = document.createElement("span");
      letter.className = "answer-letter";
      letter.textContent = String.fromCharCode(65 + index);

      const label = document.createElement("span");
      label.textContent = option;

      button.append(letter, label);

      button.addEventListener("click", () => {
        state.selectedAnswer = index;

        for (const answerButton of elements.answerOptions.children) {
          answerButton.setAttribute("aria-pressed", "false");
        }

        button.setAttribute("aria-pressed", "true");
        elements.nextButton.disabled = false;
      });

      elements.answerOptions.append(button);
    });
  }

  async function nextQuestion() {
    if (
      state.selectedAnswer === null ||
      state.submitting
    ) {
      return;
    }

    const question = state.questions[state.questionIndex];

    if (!state.answers.some((answer) => answer.questionId === question.id)) {
      state.answers.push({
        questionId: question.id,
        answerIndex: state.selectedAnswer,
      });
    }

    if (state.questionIndex < state.questions.length - 1) {
      state.questionIndex += 1;
      renderQuestion();
      return;
    }

    await submitGame();
  }

  async function submitGame() {
    state.submitting = true;
    setBusy(elements.nextButton, true, "Submitting…");
    showQuizMessage("");

    try {
      const response = await callFunction("submit", {
        playerName: state.playerName,
        teamId: state.teamId,
        attemptId: state.attemptId,
        answers: state.answers,
      });

      if (
        !response.result ||
        !Number.isInteger(response.result.score) ||
        !Number.isInteger(response.result.total_questions)
      ) {
        throw new Error("The server returned an invalid result.");
      }

      elements.quiz.hidden = true;
      elements.result.hidden = false;
      elements.resultTitle.textContent = "Well played!";
      elements.resultScore.textContent =
        `You scored ${response.result.score} out of ${response.result.total_questions}.`;
      elements.resultTeam.textContent =
        `You represented Team ${state.teamName}.`;

      elements.progressBar.style.width = "100%";
      showMessage("Your score has been saved!", "success");
    } catch (error) {
      showQuizMessage(
        `${error.message || "Could not save your score."} Your answers are retained; try submitting again.`,
        "error"
      );
    } finally {
      state.submitting = false;
      setBusy(elements.nextButton, false);
    }
  }

  function createLeaderboardEntry(rank, name, score, detail = "") {
    const entry = document.createElement("div");
    entry.className = "leaderboard-entry";

    const identity = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = name;

    const rankLabel = document.createElement("span");
    rankLabel.className = "rank";
    rankLabel.textContent = `#${rank}`;

    identity.append(rankLabel, title);

    if (detail) {
      const description = document.createElement("div");
      description.className = "muted";
      description.textContent = detail;
      identity.append(description);
    }

    const scoreLabel = document.createElement("span");
    scoreLabel.className = "score";
    scoreLabel.textContent = score;

    entry.append(identity, scoreLabel);
    return entry;
  }

  async function loadLeaderboard() {
    elements.teamLeaderboard.textContent = "Loading team standings…";
    elements.individualLeaderboard.textContent = "Loading player scores…";

    try {
      const result = await callFunction("leaderboard");

      elements.teamLeaderboard.replaceChildren();
      elements.individualLeaderboard.replaceChildren();

      const teams = result.teams || [];
      const individuals = result.individual || [];

      if (!teams.length) {
        elements.teamLeaderboard.textContent = "No team scores yet.";
      } else {
        teams.forEach((team, index) => {
          elements.teamLeaderboard.append(
            createLeaderboardEntry(
              index + 1,
              team.name,
              `${team.total_score} pts`,
              `${team.players} player${team.players === 1 ? "" : "s"}`
            )
          );
        });
      }

      if (!individuals.length) {
        elements.individualLeaderboard.textContent =
          "Be the first to play!";
      } else {
        individuals.forEach((player, index) => {
          elements.individualLeaderboard.append(
            createLeaderboardEntry(
              index + 1,
              player.player_name,
              `${player.score}/${player.total_questions}`,
              player.team_name
            )
          );
        });
      }
    } catch (error) {
      elements.teamLeaderboard.textContent =
        error.message || "Could not load team standings.";
      elements.individualLeaderboard.textContent =
        "Could not load player scores.";
    }
  }

  function resetGame() {
    state.questions = [];
    state.questionIndex = 0;
    state.answers = [];
    state.selectedAnswer = null;
    state.teamId = "";
    state.teamName = "";
    state.attemptId = null;
    state.submitting = false;

    elements.setup.hidden = false;
    elements.quiz.hidden = true;
    elements.result.hidden = true;

    showMessage("");
    showQuizMessage("");
    elements.progressBar.style.width = "0%";
    showView("play");
    elements.playerName.focus();
  }

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });

  elements.setupForm.addEventListener("submit", startGame);
  elements.nextButton.addEventListener("click", nextQuestion);
  elements.playAgainButton.addEventListener("click", resetGame);
  elements.viewScoresButton.addEventListener("click", () =>
    showView("leaderboard")
  );
  elements.refreshLeaderboard.addEventListener("click", loadLeaderboard);

  showView("play");
})();
