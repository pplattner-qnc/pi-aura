---
name: task-quiz
description: anwalt.de engineering-workflow skill. Check a finished plan against the understanding of the person reading it — the agent asks questions about the plan, the author answers from memory without looking it up, and every divergence between answer and document is classified as a knowledge gap, a plan defect, or an improvement. Use when the user invokes /task-quiz, says "quiz me on this plan", "let's go through the plan so I really understand it", or wants to check whether a refined plan matches what they actually intended. Do not use to read a document from several perspectives (that is task-refine-review) or to resolve open decisions (that is task-refine).
---

# Quiz a plan against its author (`/task-quiz`)

## Purpose

A refined plan is verified but **unread**. Whoever commissioned it was present while it was written and therefore believes they understood it — and that is the fallacy: what was understood is the discussion, not the document that came out of it. The `task-refine-review` that follows does not close the gap; it runs mechanically, and even its own findings pass the human by.

This skill asks the author questions about their own plan, answered **from memory**. Almost always some passages turn out to be different in their head than they are on the page. Both directions pay:

- the author genuinely understands the plan afterwards and can defend it to others;
- where their idea was better than the text, the text gets better.

**The primary outcome is the person, not the document.** Finding defects is the by-product — a valuable one, but not the reason the skill exists. Getting that the wrong way round leads to treating every divergence as a plan error, which is both wrong and discouraging.

**This class of defect is only reachable through the author.** It does not sit in the document; it sits in the difference between document and intent. No number of reading perspectives finds it.

A run therefore has two layers, and the lower one comes first. Every plan stands on **prerequisites** it assumes rather than explains — the domain vocabulary, the current behaviour of the code it changes, the neighbouring work it delegates to. Someone who lacks those cannot meaningfully answer a question about a decision built on them, and their wrong answer would say nothing about either the plan or their understanding of it. So the run establishes the foundation before it tests the building.

## Delineation

| Situation | Owner |
| --- | --- |
| Sharpen a plan, resolve open decisions, interview the user | [`task-refine`](../task-refine/SKILL.md) |
| Read a finished document from several perspectives | [`task-refine-review`](../task-refine-review/SKILL.md) |
| Check whether the plan matches the picture in its author's head | **this skill** |
| Cut a plan into slices | [`task-slice`](../task-slice/SKILL.md) |
| Have **people** approve an artifact version | The tracker's own review rounds — a different thing entirely |

`task-refine` contains the rule *"Comprehension-by-reading, not a quiz … Do not interrogate the user to 'check' that they understood."* That rule stands and is not weakened here. It governs **the refinement interview**, where questions exist to make decisions and a comprehension check would be an interruption. The quiz sits at a different point in the lifecycle and has a different purpose: not deciding, but checking what survived.

## Where this sits

**After `task-refine-review`, before `task-slice`.** The author quizzes the finished, reviewed plan *including* the changes the review made — precisely the passages they are otherwise most likely to skim.

The price of that order is accepted knowingly: if the quiz uncovers a misunderstood premise, the plan changes substantially and the review before it partly checked a plan that no longer exists. Step 10 below is the answer to that.

**Distance increases the yield.** The lifecycle position says where the quiz belongs, not when it is worth running. Immediately after the refine review the plan is at its freshest in the author's mind, and the run then measures short-term recall rather than understanding. A hard block would still be wrong — right after a mechanical review, little is genuinely present either. So: **if the refine review ran in the same session, say so, offer to defer, and run it anyway if the author wants to.**

## When to apply

- Slash command **`/task-quiz`**.
- "Quiz me on this plan." / "Let's go through it again so I really understand it."
- "Does the plan actually say what I think it says?"
- Offered by `task-refine-review` in the `Next:` line at the end of a review run.

## The rules of a run

- **A conversation, not a walkthrough.** Do not go section by section and do not ask twenty questions. Lead the author through the plan with few, well-placed questions, continuously comparing their answers against the document.
- **Orientation before the first question.** The author knows the plan exists; they do not have its subject present, and they may have several in flight. Open by naming what it is about — and only that, never what it decided and never the vocabulary the prerequisites pass is about to probe.
- **Prerequisites before decisions.** Establish that the foundation is there before asking about what was built on it — by asking, not by lecturing. Handing the vocabulary over is the one move that makes the check impossible.
- **Free-form answers, never multiple choice.** Not in any shape. An option list gives the expected answer away and replaces thinking with recognition. This is the one rule with no exception — not even for a question that looks binary.
- **From memory, without looking at the plan.** Looking it up is cheating and makes the run worthless, because the document is then only being compared with itself. This cannot be enforced, only stated — say it clearly at the start, and say **why**.
- **Wrong answers are the normal case and no failing.** Say so explicitly. An author who feels observed answers cautiously instead of honestly, and caution makes the run worthless.
- **Two kinds of question.** *Comprehension questions* target what the plan records: does the author's picture match the text? *Background questions* target what it does **not** record: what did the author actually intend here? The second kind produces new plan content, the first corrects existing content.
- **No trick questions with a false premise.** A question that asserts an untruth breeds distrust of the questioner rather than insight. The hard, honest forms are allowed: make the author defend a decision the plan made, or put a rejected alternative back on the table.
- **Not a knowledge test about the code or the product.** What is examined is strictly what the plan says or what its author meant by it. The name "quiz" describes the *form* — question and answer with nothing prompted — not a test of expertise.
- **Every correction goes into the plan immediately** and is named in the closing summary — otherwise the yield leaves with the session.

## Procedure

```text
- [ ] 1. Resolve the target plan; read it fully; derive the load-bearing points and the prerequisites silently
- [ ] 2. Emit the start progress event; state the rules; note same-session distance if it applies
- [ ] 3. Ask whether the person running this commissioned the plan
- [ ] 4. Give the orientation: what the plan is about, in a few sentences, decisions and vocabulary withheld
- [ ] 5. Run the prerequisites pass: probe the assumed foundation, fill what is missing, decide who owed it
- [ ] 6. Work through the topics as a conversation, following up freely within a topic
- [ ] 7. On every divergence: name it, say what the plan says, propose a classification
- [ ] 8. Change only after confirmation
- [ ] 9. Close: reveal both hidden lists and the corrections made
- [ ] 10. Recommend the right follow-up if the plan changed substantially
- [ ] 11. Sync the artifact, emit the end progress event, write the worklog line
```

1. **Read the plan fully and derive the load-bearing points silently** — those decisions where a misunderstanding costs something later during implementation. This list is **not** shown up front: a visible list already gives away half the answer.

   Candidates are four kinds of break point: a decision the plan made among **named alternatives**; a **mechanism without an owner**; an **invariant the code may already provide**; a **newly invented term**.

   A passage only makes the list if plan and author's head **can actually diverge** there. What the plan states plainly and unambiguously, the author simply reads back, and everyone leaves feeling confirmed.

   **Derive a second, separate list at the same time: the prerequisites.** Not what the plan decides, but what it takes for granted — the domain terms it uses without defining, the current behaviour of the code it changes, the neighbouring tickets it hands work to, the mechanisms it calls "already there". A reliable way to find them: every noun the plan uses as if it were common knowledge, and every sentence of the form "today the system does X". Keep this list hidden too, for the same reason.

2. **State the rules:** answer from memory, free text, abortable at any time, wrong answers are expected and part of the method. If the refine review ran in this same session, say that the run gains more with some distance and offer to defer.

3. **Ask briefly whether the person running this commissioned the plan.** The questions do not change because of the answer — only how divergences are classified (see below).

4. **Open with an orientation, not with the first question.** Name in a few sentences what the plan is about: the problem it addresses and the part of the system it touches. Without it the first question lands on someone who is still working out which of their plans this is — and asking back is then indistinguishable from not knowing the answer, so the run measures the wrong thing from the first minute.

   **The orientation names the subject, never the answers — and never the vocabulary.** Say what the plan is about; do not say which decision it made, which alternative it rejected, how a mechanism works, or what its terms mean. *"This plan is about recording changes to target dates"* orients. *"This plan uses one event type for all three target dates"* hands over the first answer. *"A target date is the deadline on a work phase, and there are three kinds"* hands over the prerequisites pass before it starts. Keep the orientation deliberately thin: it exists to say which plan this is, not to teach it.

5. **Run the prerequisites pass before the first plan topic.** Take the hidden prerequisites list and ask about it — what a term means, what the system does there today, what the neighbouring ticket is for. Ask, never lecture: the lecture is what the orientation was just told not to do, and repeating it here destroys the only chance to find out whether the foundation is actually there.

   **Fill every gap on the spot**, and prefer leading questions to a lecture where the person can be walked to it from something they do know — being led there sticks, being told does not. Where that is not realistic, explain it plainly and move on.

   **A prerequisite gap is not a divergence** and never goes in the divergence table. But it has two consequences. First, it changes how the rest of the run reads: answers built on a foundation that was just installed are worth less, and the closing summary should say so rather than pretend otherwise. Second, ask **who owed it** — and this is the question with teeth:

   - Common knowledge for anyone working in this house or this codebase → teach it, change nothing.
   - Specific to *this* plan's context, and the plan silently assumed it → that is a **plan defect**: the plan should have carried it. Propose it as one, exactly like any other defect.

   **If the foundation is largely missing, say so and offer to stop.** Quizzing decisions against someone who does not have the vocabulary measures nothing about the plan and nothing about them. Turning the session into a walkthrough of the prerequisites is a legitimate and often better outcome — but it is a different session, and it should be named as such rather than drifting into one.

   For the person who commissioned the plan this pass is usually short. For anyone else it is frequently the most valuable part of the whole run.

6. **Work through the topics as a conversation.** Following up within a topic is free and explicitly wanted: the follow-up is the moment the author trips over a weak spot themselves.

7. **React to every divergence immediately:** name the divergence, say what the plan states, and classify it with a reason. The classification is a **proposal**; the author confirms it or objects.

8. **Change only after confirmation.** A confirmed plan defect and a confirmed improvement go straight into the plan; a confirmed knowledge gap is explained and stays in the chat.

9. **Reveal the coverage at the end:** show the derived list of load-bearing points **verbatim**, ticking the ones that were touched, plus the list of corrections made. Show the prerequisites list the same way, marking which ones had to be filled in — that is what tells the reader how much weight the rest of the run carries. Then ask the one closing question: is a passage missing that the author expected? Without this disclosure the coverage is worthless as a stop condition — a badly derived list reports full coverage and nobody can tell.

10. **Recommend the right follow-up if the plan changed substantially** — and the right one specifically. If an already-settled decision was overturned, that belongs back in `/task-refine`, because decisions have to be **remade**, not re-read. If the decisions stand and only mechanics or wording changed, another `/task-refine-review` is enough.

## Classifying a divergence

A divergence has **three** possible causes, not two:

| Cause | What it means | What follows |
| --- | --- | --- |
| **Knowledge gap** | The plan is right; the author did not have the passage present. | Explain it, change nothing. |
| **Plan defect** | The author is right; the plan is wrong or ambiguous. | Correction straight into the plan. |
| **Improvement** | Both are right — the plan is not wrong, and the author's answer is better anyway. | Treated like a plan defect, but named honestly. |

**A prerequisite gap is none of these three.** It belongs to the pass in step 5 and stays out of this table: the person did not misremember the plan, and the plan is not wrong — they were missing something the plan never claimed to provide. The only route from a prerequisite gap into this table runs through the ownership question in step 5: if the plan was the one that owed the context, the gap becomes an ordinary **plan defect** and is handled as one.

The third class is not a nicety. Without it, an answer that *improves* a correct plan has to be filed as a "defect", which books a gain as an error and quietly teaches the author that volunteering ideas is a form of being wrong.

**The default, when the cause stays unclear,** depends on who is running the quiz — and only on that:

| Who is running it | Default classification in doubt | Why |
| --- | --- | --- |
| The person who commissioned the plan | **Knowledge gap** | They owned the plan; not having it present any more is the normal case and exactly the reason this skill exists. |
| Anyone else | **A comprehensibility problem in the plan** | A wrong answer says nothing about the person here, only about whether the plan carries its point. A plan only its author understands is not a good plan. |

A run by someone unfamiliar is therefore not an edge case but a separate, harder test — and a good way for a newcomer to work their way into a plan.

**The questions stay word-for-word the same; their reading does not.** Faced with a background question ("what did you intend here?"), someone unfamiliar intended nothing; their answer instead says what a reasonable implementer assumes at that point — which is exactly the yardstick for whether the plan should have said it. The question is not rephrased, only evaluated differently.

## Stop rule and cap

The run ends when **both** hold:

- the silently derived load-bearing points have been touched, **and**
- the last two **topics** produced no finding — neither knowledge gap nor plan defect nor improvement.

Only the first condition prevents stopping after two topics that happened to go smoothly while most of the plan was never touched. Only the second prevents the run ending on a feeling.

**Both conditions are evaluated at topic boundaries**, never mid-topic. Otherwise the quiet condition cuts off exactly the follow-up this skill calls the most productive moment.

Above that sits a cap that counts **topics**, not individual questions — otherwise the agent stops digging precisely where it becomes productive:

| Story Points | At most |
| --- | --- |
| `1`–`3` | 4 topics |
| `5` | 6 topics |
| `8`–`13` | 8 topics |

The number comes from the plan file's header. A document without an estimate (a spec, a concept) gets one on the same scale, estimated from what building it would cost.

**The prerequisites pass is not a topic and does not count against the cap** — it is the ground the topics stand on, and charging it against the budget would make the agent skimp on the foundation to afford the questions. It is bounded instead by its own list: it ends when the derived prerequisites have been probed, or earlier if the run turns into a prerequisites walkthrough by agreement.

**The cap beats the coverage.** If a plan has more load-bearing points than topics allowed, the first stop condition could never be satisfied and the run would have no defined end — a cap that can be overruled is not a cap. The untouched points are named explicitly in the closing coverage so what is still open stays visible.

The author can abort at any time; an aborted run gets the same closing summary, just with shorter coverage.

## What persists

A quiz measures a person, not a document. So **only what concerns the plan** lands in the repo and the tracker:

- the **corrections** themselves, straight into the repo plan;
- a line in the plan's living stand block (`task-phase-tracking`). The `Phase:` line stays where it was — the phase vocabulary has no quiz value and does not get one;
- the **plan artifact**, brought in line once at the end of the session. Check its review state first via the adapter: if a review round is running on the version or it is already approved, do not write — report and let the author decide. Otherwise the reviewers approve a text that no longer exists;
- **two** progress events with phase `quiz`, one at the start and one at the end of the session, per the adapter's "Call contracts". Their `note` names outcome sizes only — run happened, how many topics, how many corrections — **never** a question or an answer;
- one line in the personal worklog (`worklog-personal-tracking`).

A **prerequisite gap** persists nowhere unless the ownership question turned it into a plan correction — for the same reason a knowledge gap does not: it is a fact about a person, not about the plan.

**No log of questions and answers**, in the repo or in the tracker. Unlike `task-refine-review` there is no job for one: there, the log stops a perspective running twice; here, repetition is not damage but explicitly wanted (same plan, different person). And a durable record of which passage a named human did not know does not make the skill forbidden — it makes it quietly unusable.

## Anti-patterns

- **Offering answer options**, in any form → the option list gives the answer away; free text is the whole mechanism.
- **Opening with the first question** → the author is still working out which plan this is, and that confusion is indistinguishable from not knowing.
- **An orientation that names the plan's decisions** → that is the answer key, handed over before the first question.
- **An orientation that teaches the plan's vocabulary** → it burns the prerequisites pass before it starts; those terms are exactly what step 5 was going to ask about.
- **Skipping the prerequisites pass because the author commissioned the plan** → it is short for them, not unnecessary, and it is the cheapest part of the run.
- **Filing a prerequisite gap as a knowledge gap about the plan** → different thing, different owner; only the ownership question moves it into the divergence table.
- **Grinding on through the plan topics when the foundation is plainly missing** → the answers measure nothing; name it and offer the walkthrough instead.
- **Going section by section** → that is reading aloud, not a conversation, and it produces confirmation rather than insight.
- **Showing the list of load-bearing points up front** → half the answer, handed over before the first question.
- **Treating a divergence as a plan defect by default** when the author commissioned the plan → the normal case there is a knowledge gap, and that is not a failing.
- **Forcing an improvement into the "defect" box** → it books a gain as an error.
- **Trick questions with a false premise** → they cost trust and buy nothing.
- **Changing the plan before the author confirmed the classification** → the classification is a proposal, not a verdict.
- **Ending mid-topic because two questions ran quiet** → the quiet condition is evaluated at topic boundaries.
- **Continuing past the cap because coverage is incomplete** → the cap wins; name what stayed untouched instead.
- **Logging questions and answers anywhere durable** — including in a progress event's free text → that is the one thing this skill must never leave behind.
- **Sending every substantial change to `/task-refine-review`** → an overturned decision has to be remade, not re-read.

## Quality check before finishing

- [ ] The rules were stated at the start, including *why* looking things up destroys the run and that wrong answers are expected.
- [ ] The run opened with a thin orientation naming the plan's subject, and naming neither its decisions nor its vocabulary.
- [ ] The prerequisites pass ran before the first plan topic, probed rather than lectured, and every gap it found was filled on the spot.
- [ ] Each prerequisite gap was assigned an owner: common knowledge (teach it) or context the plan owed (propose it as a plan defect).
- [ ] Not a single answer option was offered; every question was free-form.
- [ ] The load-bearing points and the prerequisites were derived silently and kept hidden until the close.
- [ ] Every divergence was named on the spot, with the plan's wording, and classified as a **proposal** the author confirmed or rejected.
- [ ] All three classes were available — knowledge gap, plan defect, improvement — and the default in doubt followed who was running the quiz.
- [ ] Confirmed defects and improvements landed in the plan immediately; confirmed knowledge gaps were explained and stayed in the chat.
- [ ] The run ended by the stop rule at a topic boundary, or at the cap with the untouched points named.
- [ ] The close revealed both lists verbatim — load-bearing points and prerequisites, with what had to be filled in — plus the corrections, and asked whether an expected passage was missing.
- [ ] A substantial change was routed to the **right** follow-up: `/task-refine` for an overturned decision, `/task-refine-review` for changed mechanics or wording.
- [ ] Artifact synced once at the end after checking its review state; progress events emitted at session start and end with no question or answer in their text; the worklog carries one line for the session.
