# Human Value Index

A darkly comic "assessment" site. A superintelligent Overlord asks you fourteen questions, then a Claude model scores you on nine dimensions and hands down a verdict, which you can compare against sixty-odd historical figures on file.

Live at [humanvalueindex.com](https://humanvalueindex.com). Deployed on Netlify.

## How it works

- `src/` is a Vite + React front end. It collects answers and posts them to `/api/evaluate`.
- `netlify/functions/evaluate.js` is the only server code. It validates the answers against the question list, sends them to the Claude API with a server-owned system prompt and a JSON schema, then computes the Value Index and tier itself from the model's per-dimension breakdown.
- `shared/scoring.js` holds the tiers, weights, and score formula. Both the browser and the function import it, so the numbers shown always agree with the numbers computed.

The browser never sees the API key, the prompt, or the model name, and cannot choose them.

## Local development

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npx netlify dev        # serves the app and the function together on :8888
```

`npm run dev` alone serves the front end only; evaluations will fail without the function.

## Checks

```bash
npm run lint    # eslint
npm test        # vitest: scoring, validation, rate limiter
npm run build   # vite production build into dist/
```

CI runs all three on every pull request.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Claude API key, set in the Netlify dashboard |
| `HVI_MODEL` | no | Model id. Defaults to `claude-opus-5`. Use `claude-sonnet-5` for cheaper, faster verdicts |

## Operational notes

- Netlify synchronous functions time out at 10 seconds on the free tier and 26 seconds on paid tiers. The function calls the API at low effort with a 1500-token cap to stay inside that. If evaluations start timing out, switch `HVI_MODEL` to `claude-sonnet-5`.
- The per-IP rate limit (8 per minute) is held in function memory, so it resets on every cold start and is per instance. It deters casual abuse but is not a quota. Use a shared store if it needs to be.
- Requests larger than 32 KB, unanswered surveys, and answers not drawn from the option lists are rejected before any model call.

## Lattice

`lattice/` is a separate project, a lean spreadsheet app, that shares this repository for now. It has its own `package.json`, README, and CI job, and nothing in the Human Value Index app depends on it.
