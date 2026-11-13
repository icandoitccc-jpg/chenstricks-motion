---
name: plan-motion-video
description: "Read Motion's live production planning guide and create an executable production table from a final narration script. Use when the user asks for Motion video planning, a 制作总表, scene planning, or review of an Agent's table."
---

# Motion video planning

1. Call the connected Motion MCP's `list_guides`, then `read_guide` with `id: production-planning`. Read the returned full current guide before planning or reviewing. The canonical source lives on Motion; do not use an old cached guide as authority.
2. Follow that guide's exact schema, supported capabilities, full-text integrity, null timing rules, asset evidence requirements and acceptance checklist.
3. Use the user's final script in this conversation. Do not ask for internal Motion project IDs, revisions or project exports. This read-only MCP does not retrieve private scripts, recordings or project files.
4. Plan independently. Do not assume a target scene count, diagram/recording ratio, or that a prior Agent's answer is correct.
5. Deliver the complete importable JSON file with a concise checklist, missing-media list and unverified work. Do not claim rendering, actual media retrieval or code validation unless performed.
6. When comparing tables, pass the hard import/execution gates first, then compare story clarity, scene relevance, source authenticity, rhythm and user preparation work. Distinguish facts from editorial judgments.
7. If MCP is unavailable, read https://icandoitccc-jpg.github.io/chenstricks-motion/motion-agent-guide.md with an available web-reading tool. State that this was a web read, not an MCP call. If neither path works, report the blocker rather than inventing the guide's content.
