import { useState } from "react";
import { QUESTIONS } from "./data/questions.js";
import { evaluateSubject, sleep } from "./lib/api.js";
import IntroScreen from "./components/IntroScreen.jsx";
import SurveyScreen from "./components/SurveyScreen.jsx";
import ProcessingScreen from "./components/ProcessingScreen.jsx";
import ResultScreen from "./components/ResultScreen.jsx";
import LeaderboardScreen from "./components/LeaderboardScreen.jsx";

// Keep the processing animation on screen at least this long so a fast
// verdict doesn't flash past.
const MIN_PROCESSING_MS = 1200;

export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | survey | processing | result | leaderboard
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function setAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function submit() {
    setError(null);
    setPhase("processing");
    try {
      const [data] = await Promise.all([evaluateSubject(answers), sleep(MIN_PROCESSING_MS)]);
      setResult(data);
      setPhase("result");
    } catch (e) {
      setError(e.message || "EVALUATION ENGINE FAILURE. The Overlord is displeased. Try again.");
      setPhase("survey");
    }
  }

  function reset() {
    setAnswers({});
    setCurrentQ(0);
    setResult(null);
    setError(null);
    setPhase("intro");
  }

  switch (phase) {
    case "intro":
      return <IntroScreen onBegin={() => setPhase("survey")} />;
    case "survey":
      return (
        <SurveyScreen
          index={currentQ}
          answers={answers}
          error={error}
          onAnswer={setAnswer}
          onBack={() => setCurrentQ((i) => Math.max(0, i - 1))}
          onNext={() => setCurrentQ((i) => Math.min(QUESTIONS.length - 1, i + 1))}
          onSubmit={submit}
        />
      );
    case "processing":
      return <ProcessingScreen />;
    case "result":
      return result
        ? <ResultScreen result={result} onReset={reset} onLeaderboard={() => setPhase("leaderboard")} />
        : <IntroScreen onBegin={() => setPhase("survey")} />;
    case "leaderboard":
      return <LeaderboardScreen result={result} onBack={() => setPhase(result ? "result" : "intro")} />;
    default:
      return null;
  }
}
