// Sends the subject's answers to the evaluation endpoint. The server owns the
// model, the prompt, and the scoring; the browser only supplies answers.
export async function evaluateSubject(answers) {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (gateway timeout page, etc.). Fall through to the status check.
  }
  if (!res.ok || !data || data.error) {
    throw new Error(data?.error || `Evaluation engine returned status ${res.status}. The Overlord is displeased. Try again.`);
  }
  return data;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
