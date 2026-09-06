# Validation record

Status: **not run**. This checklist is preparation, not test evidence.

## Browser scenarios

Use two separate test accounts and non-sensitive example writing. Obtain authorization before live browser/service checks.

| Scenario | Expected behavior | Result |
| --- | --- | --- |
| Fresh visitor, desktop and 320/390 px mobile | Landing, navigation and four sample steps are usable without sign-in; no horizontal page overflow | Pending |
| Keyboard-only navigation | Visible focus, labeled inputs, usable source disclosures, readable errors; every action reachable | Pending |
| Google popup closed or blocked | Clear recoverable error; no broken loading state | Pending |
| Restore session / sign out | Correct owner's journal appears; private editor and pending data disappear on sign-out | Pending |
| Signed-in Home | Root route opens the personalized Home page; latest-page, journal, new-decision, graph and pattern actions reach the correct destinations; summary counts update | Pending |
| New journal page | Title, text, tags and selected reflection mode are saved under the authenticated UID; Gemini output remains visually separate | Pending |
| Journal follow-up | Original page, first reflection and prior turns are included; the new user/model pair persists after reload | Pending |
| Preserved journal entry | Earlier entries remain readable and can receive tags or new follow-up turns without losing original content | Pending |
| Journal search and tags | Search matches title, entry, Gemini text, tags and turns; tag filters include newly edited tags and clear correctly | Pending |
| Journal calendar | Correct local dates show journal and decision markers; selecting and clearing a date filters pages accurately | Pending |
| Voice dictation, allowed | User gesture requests microphone access; interim transcript remains editable; microphone audio is not included in the Gemini request | Pending |
| Voice dictation, denied or unsupported | Clear recovery message appears and typed journal entry remains usable | Pending |
| Gemini context disclosure | New-entry and follow-up disclosures match the actual bounded server payload; unrelated records and account details are absent | Pending |
| Complete manual loop, AI unavailable | Save brief, commit, append review; reload reproduces each persisted step | Pending |
| Gemini conversation and brief | Follow-ups use current conversation; suggested brief remains editable; generated result survives a save failure | Pending |
| Account switch during slow AI call | Old request is aborted/ignored and cannot update the new workspace or send the old draft with a new token | Pending |
| Lost save response after successful write | Retry uses the same mutation and record IDs; no duplicate decision or review | Pending |
| Offline or rejected save | Writing remains; error offers the same-save retry; no false “saved” state | Pending |
| Two tabs edit the same revision | Second save conflicts; user draft stays visible; original saved record is not overwritten | Pending |
| Unsaved commitment/review then stage switch | Writing remains and navigation/refresh warns until that form is saved | Pending |
| Committed decision | Brief and commitment remain immutable; subsequent reviews append | Pending |
| Review due today in local time | Dashboard surfaces it; adding a review closes the due prompt | Pending |
| Select no past sources | Request sends no previous decision records | Pending |
| Select older sources | Load older decisions, explicitly select at most 20, inspect exact bounded content preview | Pending |
| Pattern with two reviewed personal entries | Every observation references at least two selected records; each link opens the source | Pending |
| Insufficient pattern evidence | Empty insight result is explained; no invented pattern | Pending |
| Source changed or deleted | Prior report is hidden; regenerate with current selected records | Pending |
| Fictional walkthrough and copy | No writes before explicit copy; repeated copy does not duplicate or overwrite; samples stay labeled | Pending |
| Mixed fictional and real pattern sources | Request rejected with instruction to analyze separately | Pending |
| Knowledge graph relationships | Nodes and lines reflect only tags, journal-derived decisions, selected decision evidence and pattern citations; no inferred links appear | Pending |
| Knowledge graph controls | Animated settling, individual pointer dragging, arrow-key node movement, pan, wheel/buttons zoom, reset, search, type filters, keyboard selection and inspector actions work; reduced-motion mode does not animate | Pending |
| Knowledge graph limits and mobile | Recent-record notice appears when capped; graph and four-tab navigation remain usable at 320/390 px | Pending |
| Markdown and JSON exports | Markdown contains every stored journal page and turn; JSON contains the authenticated user's journal, decisions and latest pattern only | Pending |
| Delete one journal page | Confirmation is required; only the selected owned page disappears and other records remain | Pending |
| Delete all stored data on disposable account | Exact `DELETE` confirmation is required; all Firestore descendants for that UID disappear while another user's data and the Firebase sign-in account remain | Pending |
| Usage limits / provider timeout | Safe message; manual writing and saving still work | Pending |

## Deployment evidence to collect

- Actual project, named database, service revision, region, runtime identity and URL.
- Successful sign-in on the deployed domain and process restart/reload persistence.
- Rule test output, server test output, typecheck/build results, date, and commit identifier.
- Cross-user denial through both the client SDK and custom API on the deployed setup.
- Export and deletion evidence collected with synthetic data only, including proof that recursive deletion cannot cross the verified UID boundary.
- Browser and device matrix for speech recognition, denied microphone permission, graph pointer controls and keyboard navigation.
- Confirmation that the runtime receives a Secret Manager reference, and no Gemini credential is in delivered browser assets.
- Short demo recording and independently checked source links.
- AI Studio prompts/changes and configured security instructions, with secrets and personal data excluded.

Record failures candidly. Do not mark a row complete based on source inspection alone.
