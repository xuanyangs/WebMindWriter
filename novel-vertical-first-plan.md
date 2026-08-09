# Novel Vertical First Plan

## Goal

Build WebMindWriter into a web-novel author agent that can scan rankings, tear down samples, create ideas, turn ideas into writing recipes, manage local novel projects, and eventually support chapter writing.

## Principle

Do not generalize into a broad content platform yet. First make the web-novel vertical work end to end. Each loop must produce a runnable command and a local Markdown or data artifact that can be reviewed and fed back into the next loop.

## Loop Roadmap

| Loop | Status | Output |
| --- | --- | --- |
| Loop 0: Agent Orchestrator | Done | `npm run agent:run` and `reports/latest-agent-run.md` |
| Loop 1: IdeaAgent | In progress | `npm run agent:ideas` and `reports/latest-ideas.md` |
| Loop 2: RecipeAgent | Next | Writing recipe from selected idea cards |
| Loop 3: Novel Project | Pending | Local novel project files and metadata |
| Loop 4: WritingAgent | Pending | Chapter draft generation with memory |
| Loop 5: Desktop UI | Pending | Non-command-line author workflow |
| Loop 6: Cloud Platform | Pending | Login, quotas, deployment, admin |

## Current Rule

When choosing the next implementation target, prefer the smallest missing link that moves the author from data toward actual writing. After IdeaAgent, the next highest-value link is RecipeAgent.
