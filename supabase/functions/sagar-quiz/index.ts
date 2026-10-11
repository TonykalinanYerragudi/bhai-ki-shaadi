import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const questions = [
  {
    id: "q1",
    question: "What is Sagar's favourite food?",
    options: ["Chicken biryani", "Pizza", "Mutton biryani", "Something else"]
  },
  {
    id: "q2",
    question: "What is Sagar's favourite movie type?",
    options: ["Action", "Love Story", "Comedy", "Super Hero"]
  },
  {
    id: "q3",
    question: "What does Sagar enjoy doing in his free time?",
    options: ["Watching movies", "Listening to music", "Going out", "Playing games"]
  },
  {
    id: "q4",
    question: "What is Sagar most likely to do after waking up?",
    options: ["Check his phone", "Go back to sleep", "Look for breakfast", "Start chatting"]
  },
  {
    id: "q5",
    question: "What is Sagar's biggest strength?",
    options: ["Making people laugh", "Taking responsibility", "Staying calm", "Being determined"]
  },
  {
    id: "q6",
    question: "What is Sagar most famous for at home?",
    options: ["A catchphrase", "A funny habit", "His dance moves", "Being particular about things"]
  },
  {
    id: "q7",
    question: "What would Sagar choose for a free day?",
    options: ["Sleep and relax", "Go on a trip", "Watch movies", "Spend time with family"]
  },
  {
    id: "q8",
    question: "When Sagar gets annoyed, what does he usually do?",
    options: ["Stay quiet", "Explain his point", "Walk away for a bit", "Make a joke"]
  },
  {
    id: "q9",
    question: "Who knows Sagar best?",
    options: ["His brother", "His bride", "His mother", "His cousins"]
  },
  {
    id: "q10",
    question: "Who will have the final say after Sagar gets married? 😂",
    options: ["Sagar", "His bride", "His mother", "They will decide together"]
  }
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { action, player_name, answers } = await req.json();

    if (action === "questions") {
      return json({ questions });
    }

    const url = Deno.env.get("PROJECT_URL");
    const serviceKey = Deno.env.get("PROJECT_SERVICE_KEY");
    const answerSecret = Deno.env.get("QUIZ_ANSWER_KEY");

    if (!url || !serviceKey || !answerSecret) {
      return json({ error: "Quiz backend is not configured yet." }, 503);
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false }
    });

    if (action === "leaderboard") {
      const { data, error } = await supabase
        .from("quiz_scores")
        .select("player_name,score,created_at")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(20);

      if (error) throw error;
      return json({ scores: data ?? [] });
    }

    if (action !== "submit") {
      return json({ error: "Unknown action" }, 400);
    }

    const name = typeof player_name === "string" ? player_name.trim() : "";
    if (name.length < 1 || name.length > 40) {
      return json({ error: "Enter a name between 1 and 40 characters." }, 400);
    }

    if (
      !Array.isArray(answers) ||
      answers.length !== questions.length ||
      answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)
    ) {
      return json({ error: "Please answer all 10 questions." }, 400);
    }

    // QUIZ_ANSWER_KEY is a Supabase secret containing a JSON array of ten option indexes (0-3).
    // Keep it out of this source file and out of the frontend.
    const correct = JSON.parse(answerSecret);
    if (
      !Array.isArray(correct) ||
      correct.length !== questions.length ||
      correct.some((a) => !Number.isInteger(a) || a < 0 || a > 3)
    ) {
      return json({ error: "Quiz answer key is not configured correctly." }, 503);
    }

    const score = answers.reduce(
      (total: number, answer: number, i: number) => total + (answer === correct[i] ? 1 : 0),
      0
    );

    const { error } = await supabase.from("quiz_scores").insert({ player_name: name, score });
    if (error) throw error;

    const message =
      score === 10
        ? "Sagar's ultimate expert! The cousins cannot beat you!"
        : score >= 7
          ? "You know Sagar really well!"
          : score >= 4
            ? "Not bad! More family time required 😄"
            : "Time for some cousin bonding 😂";

    return json({ score, message });
  } catch (error) {
    console.error("sagar-quiz error", error);
    return json({ error: "Could not process the quiz. Please try again." }, 500);
  }
});
