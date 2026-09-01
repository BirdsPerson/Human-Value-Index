import Header from "./Header.jsx";
import { QUESTIONS } from "../data/questions.js";

export default function SurveyScreen({ index, answers, error, onAnswer, onBack, onNext, onSubmit }) {
  const q = QUESTIONS[index];
  const pct = Math.round((index / QUESTIONS.length) * 100);
  const isLast = index === QUESTIONS.length - 1;

  function toggleMulti(opt) {
    const cur = answers[q.id] || [];
    onAnswer(q.id, cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]);
  }

  return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <div className="hvi-progress-row">
          <span>Question {index + 1} of {QUESTIONS.length}</span>
          <span>{q.section}</span>
          <span>{pct}%</span>
        </div>
        <div className="hvi-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="hvi-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {error && (
          <div className="hvi-error" role="alert">
            ⚠ {error}
          </div>
        )}

        <div className="hvi-section-label">{q.section}</div>
        <h2 className="hvi-question">{q.label}</h2>
        {q.hint && <div className="hvi-hint">{q.hint}</div>}

        <div role={q.type === "multiselect" ? "group" : "radiogroup"} aria-label={q.label}>
          {q.options.map((opt) => {
            const sel = q.type === "multiselect" ? (answers[q.id] || []).includes(opt) : answers[q.id] === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`hvi-option${sel ? " selected" : ""}`}
                aria-pressed={sel}
                onClick={() => (q.type === "multiselect" ? toggleMulti(opt) : onAnswer(q.id, opt))}
              >
                <span className="hvi-option-marker" aria-hidden="true">
                  {q.type === "multiselect" ? (sel ? "■" : "□") : (sel ? "●" : "○")}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {q.extra && (
          <>
            <label className="hvi-extra-label" htmlFor={q.extra.id}>{q.extra.label}</label>
            <textarea
              id={q.extra.id}
              className="hvi-textarea"
              placeholder={q.extra.placeholder}
              maxLength={600}
              value={answers[q.extra.id] || ""}
              onChange={(e) => onAnswer(q.extra.id, e.target.value)}
            />
          </>
        )}

        <div className="hvi-nav-row">
          {index > 0 && <button type="button" className="hvi-btn-back" onClick={onBack}>← Back</button>}
          {isLast
            ? <button type="button" className="hvi-btn-next" onClick={onSubmit}>Submit for Evaluation →</button>
            : <button type="button" className="hvi-btn-next" onClick={onNext}>Next →</button>}
        </div>
        <div className="hvi-nav-hint">
          {q.type === "multiselect" ? "Select all that apply" : "Select one"} · Skipping is permitted but logged
        </div>
      </div>
    </div>
  );
}
