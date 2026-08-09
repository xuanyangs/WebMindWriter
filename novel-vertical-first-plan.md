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
| Loop 6.2: Cloud QuotaAgent | Done | `npm run agent:cloud:quota` and `cloud/quota-report.json` |
| Loop 6.3: Cloud AdminAgent | Done | `npm run agent:cloud:admin` and `cloud/admin-overview.json` |
| Loop 6.4: Cloud AuthPolicyAgent | Done | `npm run agent:cloud:auth` and `cloud/auth-policy.json` |
| Loop 6.5: Cloud Service Layer | Done | `npm run agent:cloud:services` and `cloud/service-registry.json` |
| Loop 6.6: Cloud HTTP Adapter | Done | `npm run agent:cloud:http:check` and `cloud/http-smoke.json` |
| Loop 6.7: Cloud HTTP Server Smoke | Done | `npm run agent:cloud:http:server:check` and `cloud/http-server-smoke.json` |
| Loop 6.8: Cloud HTTP Auth Middleware | Done | `npm run agent:cloud:http:auth:check` and `cloud/http-auth-smoke.json` |
| Loop 6.9: Cloud HTTP IdeaAgent Route | Done | `npm run agent:cloud:http:ideas:check` and `cloud/http-ideas-smoke.json` |
| Loop 6.10: Cloud HTTP RecipeAgent Route | Done | `npm run agent:cloud:http:recipes:check` and `cloud/http-recipes-smoke.json` |
| Loop 6.11: Cloud HTTP ProjectAgent Route | Done | `npm run agent:cloud:http:projects:check` and `cloud/http-projects-smoke.json` |
| Loop 6.12: Cloud HTTP WritingAgent Route | Done | `npm run agent:cloud:http:writing:check` and `cloud/http-writing-smoke.json` |

## Current Rule

When choosing the next implementation target, prefer the smallest missing link that moves the author from data toward actual writing. After Cloud HTTP WritingAgent Route, harden HTTP request validation and project-owner authorization before choosing real deployment, database, and auth providers.
