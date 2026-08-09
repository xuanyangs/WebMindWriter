# Novel Vertical First Plan

## Goal

Build WebMindWriter into a web-novel author agent that can scan rankings, tear down samples, create ideas, turn ideas into writing recipes, manage local novel projects, and eventually support chapter writing.

## Principle

Do not generalize into a broad content platform yet. First make the web-novel vertical work end to end. Each loop must produce a runnable command and a local Markdown or data artifact that can be reviewed and fed back into the next loop.

## Loop Roadmap

| Loop | Status | Output |
| --- | --- | --- |
| Loop 0: Agent Orchestrator | Done | `npm run agent:run` and `reports/latest-agent-run.md` |
| Loop 1: IdeaAgent | Done | `npm run agent:ideas` and `reports/latest-ideas.md` |
| Loop 2: RecipeAgent | Done | `npm run agent:recipe` and `reports/latest-recipe.md` |
| Loop 3: Novel Project | Done | `npm run agent:project:create` and `projects/<project-id>/` |
| Loop 4: WritingAgent | Done | `npm run agent:write:chapter` and `projects/<project-id>/chapters/chapter-001.md` |
| Loop 5: Desktop UI | Done | `npm run agent:ui:build` and `ui/latest-dashboard.html` |
| Loop 6: Cloud Platform | Done | `npm run agent:cloud:plan` and `cloud/cloud-readiness.json` |
| Loop 6.1: Cloud API Contract | Done | `npm run agent:cloud:contract` and `cloud/api-contract.json` |

## Current Rule

When choosing the next implementation target, prefer the smallest missing link that moves the author from data toward actual writing. After Cloud API Contract, the next step is either to extract CLI logic into a service layer or choose real deployment, database, and auth providers.
