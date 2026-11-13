---
name: plan-motion-video
description: "Read Motion's live production planning guide and create an executable production table from a final narration script. Use when the user asks for Motion video planning, a 制作总表, scene planning, or review of an Agent's table."
---

# Motion video planning

1. Call the connected Motion MCP's `list_guides`, then `read_guide` with `id: production-planning`. Read the returned full current guide before planning or reviewing. The canonical source lives on Motion; do not use an old cached guide as authority.
2. Follow that guide's exact schema, supported capabilities, full-text integrity, null timing rules, asset evidence requirements and acceptance checklist.
3. If the user supplies a project handoff accessKey, call read_project to obtain its final script, existing scenes, asset metadata and revision. Otherwise use the final script in this conversation. Never ask for internal project IDs or exports. A handoff authorizes only one project for 24 hours; never publish its key. Media bytes remain unavailable through this interface.
4. Plan independently. Do not assume a target scene count, diagram/recording ratio, or that a prior Agent's answer is correct.
5. With a handoff, submit the complete plan using submit_plan and the expectedRevision returned by read_project; fix parser errors before resubmission. Explain that Motion will present the plan for user adoption. Without a handoff, deliver an importable JSON file. In both cases report checks, missing media and unverified work. Do not claim rendering, media retrieval or code validation unless performed.
6. When comparing tables, pass the hard import/execution gates first, then compare story clarity, scene relevance, source authenticity, rhythm and user preparation work. Distinguish facts from editorial judgments.
7. If MCP is unavailable, read https://icandoitccc-jpg.github.io/chenstricks-motion/motion-agent-guide.md with an available web-reading tool. State that this was a web read, not an MCP call. If neither path works, report the blocker rather than inventing the guide's content.
