# Questions Workflow

Aura has a question queue where users post questions **directed at specific
employees**. These are not AI chatbot questions — they are "ask a colleague"
requests. For example: "Jane, how does the deployment rollback workflow
work?" or "What's the process for requesting a new Bitbucket repo?"

As an agent, you can help answer these questions on behalf of the user (the
PAT owner), provided you have enough context to give an accurate answer.

## Getting a question

```
mcpGetQuestion({ id: "<question-uuid>" })
```

## Answering a question

```
mcpAnswerQuestion({
  id: "<question-uuid>",
  answer: "The deployment rollback workflow works as follows..."
})
```

- Saves the answer and marks the question as ANSWERED
- Requires EDIT access to the question
- The answer is attributed to the PAT owner (you are answering on their behalf)

## Finding questions

Questions appear in unified search results:

```
unifiedSearch({ query: "...", source_types: ["QUESTION"] })
```

Questions also appear in the memory graph as entity type `question` and can
be explored via `getMemoryGraph` and `listMemoryEntities`.

## Important considerations

- **These are directed at a person.** The asker expects an answer from the
  question's target, not a generic AI response. Only answer if you are
  confident the information is correct and complete.
- **Check the wiki first.** Many workflow questions are already answered in
  the knowledge base. Search before composing an answer from scratch.
- **When in doubt, flag to the user.** If the question requires personal
  knowledge or a judgment call, present it to the user rather than guessing.
