# Foresight submission kit

Draft materials. Replace placeholders and verify behavior before publishing. Nothing here has been posted or submitted.

## Brief description

Foresight is a private Gemini journal that helps students and early-career users turn reflection into action. Users write freely, choose whether Gemini should reflect, summarize, or brainstorm, and can continue the conversation across multiple turns. When a reflection reveals a choice, they can carry it directly into a decision workflow: clarify options, record an expectation and a small experiment, return to the actual outcome, and apply that experience to the next choice. Gemini also helps structure decision briefs and suggests tentative patterns linked to the user's selected evidence. Original commitments stay intact, making hindsight visible.

Firebase Authentication signs users in with Google and gives the backend a verified identity for every API request. Cloud Firestore stores each user's private decision history, multi-turn conversation, reviews, and source-linked reflections under that user's isolated document path. Gemini powers the multi-turn decision conversation, structured briefs, outcome reviews, and evidence-linked pattern reflections. Google Cloud Run hosts the frontend and authenticated Express API; the server reads the Gemini API key at runtime from a Secret Manager binding, so the credential is never shipped to the browser or committed to source. A fictional student journey demonstrates the complete loop without pretending example data is a live result.

Deployment sentence above describes the intended deployed architecture. Do not submit it as a completed deployment claim until the live service has been validated.

## A three-minute walkthrough

1. **0:00–0:20 — The problem.** “We often remember decisions differently after knowing the outcome. What if we preserved what we expected and learned from the difference?” Show the landing notebook.
2. **0:20–0:50 — Clarify.** Sign in. Describe a real test dilemma: choose a narrowly scoped campus project or an ambitious social app. Discuss the tradeoff, generate the brief and edit an assumption. Say explicitly when an AI call is live.
3. **0:50–1:20 — Commit.** Choose the room finder. Set a five-student usability experiment, 70% confidence, and a review date. Show that the saved commitment is preserved.
4. **1:20–1:50 — Review.** Either enter a clearly labeled test outcome or switch to the fictional walkthrough and identify it as such. Compare five successful searches to the original criterion. Show the student's observation separately from Gemini's interpretation.
5. **1:50–2:25 — Apply.** Open the internship decision from the fictional sample. Show the checked past source, exact context preview and the question it informs. Open a pattern's evidence link. Explain that the AI identifies a hypothesis, not causation.
6. **2:25–2:50 — Trust.** Show collected cross-user-denial evidence and explain server-only secrets, owner-scoped paths, stable retries and immutable commitments. Only show tests actually run.
7. **2:50–3:00 — Close.** “The output is not just advice. It's a record of what I expected, what happened, and what I can try next.” Display repository and deployed demo links.

## Social post draft

I built Foresight for the Gen AI Academy APAC Cohort 3 Ideathon: a decision journal that helps students turn choices into small experiments and learn from their outcomes.

Clarify a decision → record an expectation → review what happened → bring that evidence into the next choice.

Built with Gemini, Firebase Authentication, Cloud Firestore, Cloud Run and Secret Manager. AI interpretations link back to selected journal evidence, and the original commitment stays intact.

Demo: [ADD VERIFIED WALKTHROUGH LINK]
Source: [ADD REPOSITORY LINK]

#AccelerateAIwithCloudRun

## Mandatory deliverables

- [ ] Registered for Gen AI Academy APAC Cohort 3.
- [ ] Actual AI Studio project/custom security directives and original enhancement evidence.
- [ ] Confirmed eligibility of the combined Studio/local workflow.
- [ ] Validated live Cloud Run link or eligible video/blog walkthrough.
- [ ] Cloud Run label `dev-tutorial=cloud-run-ai-challenge` verified on the service, when deployed.
- [ ] Public/shared source repository including frontend, backend, README, rules and reproducible configuration.
- [ ] No secrets or personal journal data in the repository or recording.
- [ ] Description explicitly explaining Firebase, Firestore, Gemini and Cloud Run usage.
- [ ] Published social/demo post including `#AccelerateAIwithCloudRun` and its link.
- [ ] Every required field completed in the Ideathon Prototype Submission form.

## Links and evidence

| Item | Reference |
| --- | --- |
| Live app | Pending |
| Source repository | Pending |
| Walkthrough | Pending |
| Social post | Pending |
| AI Studio evidence | Pending |
| Validation record | `docs/VALIDATION.md` — not run |
