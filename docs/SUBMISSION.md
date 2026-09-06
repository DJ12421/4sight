# Foresight submission kit

Draft materials. Replace placeholders and verify behavior before publishing. Nothing here has been posted or submitted.

## Brief description

Foresight is a private Gemini journal that helps students and early-career users turn reflection into action. Users can type or dictate an editable entry, organize it with tags and a calendar, choose whether Gemini should reflect, summarize, or brainstorm, and continue the conversation across multiple turns. A visual knowledge graph maps explicit connections among journal pages, decisions, tags, selected evidence, and Gemini pattern citations. When a reflection reveals a choice, users can carry it directly into a decision workflow: clarify options, record an expectation and a small experiment, return to the actual outcome, and apply that experience to the next choice. The interface explains exactly what is sent to Gemini and provides authenticated export and deletion controls. Original commitments stay intact, making hindsight visible.

Firebase Authentication signs users in with Google and gives the backend a verified identity for every API request. Cloud Firestore stores each user's journal pages, tags, conversations, decisions, reviews, pattern reports and quota record under that user's isolated document path. Gemini powers mode-specific journal reflections, multi-turn journal and decision conversations, structured briefs, outcome reviews, and evidence-linked pattern reflections. Google Cloud Run hosts the frontend and authenticated Express API; the server receives the Gemini API key through a Secret Manager runtime binding, so the credential is never shipped to the browser or committed to source. The knowledge graph is computed locally from the user's loaded records and sends nothing to Gemini. A fictional student journey demonstrates the complete decision loop without presenting example data as a live result.

Deployment sentence above describes the intended deployed architecture. Do not submit it as a completed deployment claim until the live service has been validated.

## A three-minute walkthrough

1. **0:00–0:20 — The problem.** “Thoughts disappear, and decisions look obvious after we know the outcome. What if a journal could preserve both and help us learn?” Show the landing notebook.
2. **0:20–0:50 — Journal.** Sign in, dictate or type a non-sensitive example entry, add tags, choose a reflection mode, and show the disclosure of exactly what Gemini receives. Say explicitly when the live AI call begins.
3. **0:50–1:15 — Continue and act.** Ask one follow-up question, then use “Turn this into a decision.” Show that the journal origin is retained without sending unrelated pages.
4. **1:15–1:45 — Decide and review.** Generate an editable brief, record a confidence estimate and small experiment, then use a clearly labeled fictional outcome to show the original commitment beside the later review.
5. **1:45–2:15 — Connect.** Open the Graph tab. Show the journal, tag, decision and Gemini-pattern nodes settle into place; drag one node, inspect an explicit connection, and open its source. Explain that the physics changes only the layout—the graph invents no semantic links.
6. **2:15–2:40 — Trust and ownership.** Show the Gemini context disclosure and export controls. Explain verified Firebase identity, UID-scoped Firestore paths, browser-read-only rules, server-side Gemini, Secret Manager binding, and confirmation-protected deletion. Only show tests actually run.
7. **2:40–3:00 — Close.** “Foresight turns private reflection into a record of what I thought, what I tried, what happened, and what I can carry forward.” Display repository and verified demo links.

## Social post draft

I built Foresight for the Gen AI Academy APAC Cohort 3 Ideathon: a private Gemini journal that helps students turn reflection into evidence-backed action.

Write or dictate → reflect with Gemini → connect ideas in a knowledge graph → test a decision → learn from what happened.

Built with Gemini, Firebase Authentication, Cloud Firestore, Cloud Run and Secret Manager. Multi-turn reflections remain user-isolated, the graph uses explicit stored links, and AI interpretations stay connected to their evidence.

Demo: [ADD VERIFIED WALKTHROUGH LINK]
Source: https://github.com/DJ12421/4sight

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
| Source repository | https://github.com/DJ12421/4sight — verify public access after pushing the final commit |
| Walkthrough | Pending |
| Social post | Pending |
| AI Studio evidence | Pending |
| Validation record | `docs/VALIDATION.md` — not run |
