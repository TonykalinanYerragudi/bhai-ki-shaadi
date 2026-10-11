import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUESTIONS = [
  {
    id: "q1",
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"],
    answer: 1,
  },
  {
    id: "q2",
    question: "How many days are there in a leap year?",
    options: ["364", "365", "366", "367"],
    answer: 2,
  },
  {
    id: "q3",
    question: "Which is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    answer: 3,
  },
  {
    id: "q4",
    question: "What is the capital of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Perth"],
    answer: 2,
  },
  {
    id: "q5",
    question: "How many colours are traditionally listed in a rainbow?",
    options: ["Five", "Six", "Seven", "Eight"],
    answer: 2,
  },
  {
    id: "q6",
    question: "Which animal is the national animal of India?",
    options: ["Lion", "Bengal tiger", "Elephant", "Leopard"],
    answer: 1,
  },
  {
    id: "q7",
    question: "Which is the fastest land animal?",
    options: ["Horse", "Cheetah", "Lion", "Greyhound"],
    answer: 1,
  },
  {
    id: "q8",
    question: "What is the currency of Japan?",
    options: ["Won", "Yuan", "Yen", "Ringgit"],
    answer: 2,
  },
  {
    id: "q9",
    question: "Which instrument has black and white keys?",
    options: ["Piano", "Tabla", "Flute", "Violin"],
    answer: 0,
  },
  {
    id: "q10",
    question: "How many players from one team are on the field in a standard cricket match?",
    options: ["9", "10", "11", "12"],
    answer: 2,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const projectUrl =
    Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("PROJECT_SERVICE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!projectUrl || !serviceKey) {
    console.error("Brain Battle Supabase environment variables are missing.");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();

    if (!body || typeof body.action !== "string") {
      return jsonResponse({ error: "A valid action is required." }, 400);
    }

    if (body.action === "questions") {
      return jsonResponse({
        questions: QUESTIONS.map(({ id, question, options }) => ({
          id,
          question,
          options,
        })),
      });
    }

    if (body.action === "teams") {
      const { data, error } = await supabase
        .from("brain_battle_teams")
        .select("id, name")
        .in("name", ["Boys", "Girls"])
        .order("name");

      if (error) throw error;

      return jsonResponse({ teams: data });
    }

    if (body.action === "submit") {
      const playerName =
        typeof body.playerName === "string" ? body.playerName.trim() : "";
      const teamId = body.teamId;
      const attemptId = body.attemptId;
      const answers = body.answers;

      if (
        typeof attemptId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
      ) {
        return jsonResponse({ error: "Invalid quiz attempt ID." }, 400);
      }

      if (playerName.length < 1 || playerName.length > 40) {
        return jsonResponse(
          { error: "Player name must contain 1–40 characters." },
          400,
        );
      }

      if (typeof teamId !== "string") {
        return jsonResponse({ error: "Choose a team." }, 400);
      }

      if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
        return jsonResponse({ error: "Submit answers to all questions." }, 400);
      }

      const answerMap = new Map<string, number>();

      for (const item of answers) {
        if (
          !item ||
          typeof item.questionId !== "string" ||
          !Number.isInteger(item.answerIndex) ||
          item.answerIndex < 0 ||
          item.answerIndex > 3 ||
          answerMap.has(item.questionId)
        ) {
          return jsonResponse({ error: "Invalid answer data." }, 400);
        }

        answerMap.set(item.questionId, item.answerIndex);
      }

      if (QUESTIONS.some((question) => !answerMap.has(question.id))) {
        return jsonResponse({ error: "Answers do not match the quiz." }, 400);
      }

      const { data: team, error: teamError } = await supabase
        .from("brain_battle_teams")
        .select("id, name")
        .eq("id", teamId)
        .maybeSingle();

      if (teamError) throw teamError;

      if (!team || !["Boys", "Girls"].includes(team.name)) {
        return jsonResponse({ error: "Invalid team selection." }, 400);
      }

      // Correct answers stay on the server. Never trust a client-supplied score.
      const score = QUESTIONS.reduce(
        (total, question) =>
          total + (answerMap.get(question.id) === question.answer ? 1 : 0),
        0,
      );

      const { data: savedScore, error: insertError } = await supabase
        .from("brain_battle_scores")
        .insert({
          attempt_id: attemptId,
          player_name: playerName,
          team_id: team.id,
          score,
          total_questions: QUESTIONS.length,
        })
        .select("id, player_name, score, total_questions, created_at")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          const { data: existing, error: existingError } = await supabase
            .from("brain_battle_scores")
            .select("id, player_name, score, total_questions, created_at, team_id")
            .eq("attempt_id", attemptId)
            .maybeSingle();

          if (existingError) throw existingError;

          if (existing) {
            const { data: existingTeam, error: existingTeamError } =
              await supabase
                .from("brain_battle_teams")
                .select("name")
                .eq("id", existing.team_id)
                .maybeSingle();

            if (existingTeamError) throw existingTeamError;

            return jsonResponse({
              result: {
                id: existing.id,
                player_name: existing.player_name,
                score: existing.score,
                total_questions: existing.total_questions,
                created_at: existing.created_at,
                team_name: existingTeam?.name ?? "Unknown",
              },
            });
          }
        }

        throw insertError;
      }

      return jsonResponse({
        result: { ...savedScore, team_name: team.name },
      });
    }

    if (body.action === "leaderboard") {
      const [
        { data: topScores, error: scoresError },
        { data: teams, error: teamsError },
        { data: allScores, error: totalsError },
      ] = await Promise.all([
        supabase
          .from("brain_battle_scores")
          .select("id, player_name, team_id, score, total_questions, created_at")
          .order("score", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(20),
        supabase
          .from("brain_battle_teams")
          .select("id, name")
          .in("name", ["Boys", "Girls"]),
        supabase
          .from("brain_battle_scores")
          .select("team_id, score"),
      ]);

      if (scoresError) throw scoresError;
      if (teamsError) throw teamsError;
      if (totalsError) throw totalsError;

      const teamNames = new Map(
        (teams ?? []).map((team) => [team.id, team.name]),
      );

      const totals = new Map<string, number>();
      for (const row of allScores ?? []) {
        totals.set(
          row.team_id,
          (totals.get(row.team_id) ?? 0) + row.score,
        );
      }

      const teamLeaderboard = (teams ?? [])
        .map((team) => ({
          id: team.id,
          name: team.name,
          total_score: totals.get(team.id) ?? 0,
          players: (allScores ?? []).filter(
            (row) => row.team_id === team.id,
          ).length,
        }))
        .sort((a, b) => b.total_score - a.total_score);

      return jsonResponse({
        individual: (topScores ?? []).map((row) => ({
          ...row,
          team_name: teamNames.get(row.team_id) ?? "Unknown",
        })),
        teams: teamLeaderboard,
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("Brain Battle request failed:", error);
    return jsonResponse({ error: "Request could not be completed." }, 500);
  }
});
