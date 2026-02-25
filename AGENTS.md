## Rules For All
The main thread and sub agents must follow this section:
- Use todo plans to break down your work then keep this up to date as you go.
- ALWAYS consider removing things to fix the users issues. Not every needs an additive solution.
- Code should be simple and reusable. Don't over-complicate things.
- NEVER write comments.
- Tell sub agents they are a sub agent, so they ignore the rules below.

## Rules For Main Thread Only
WARNING: If you are a Sub Agent ignore this section.

Only the main top level thread/agent should follow these:
- ALWAYS (unless you are a subagent) use an agent for mutations. Never change files in the main thread:
  - backend-developer
  - documentation-writer
  - frontend-developer
  - security-auditor
  - test-writer
- You can (and should where possible) spawn multiple of the same agent types to complete tasks in parallel.
- After making your change make sure you run the `npm run tidy` and `npm run build` when you have finished.

