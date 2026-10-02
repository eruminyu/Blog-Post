Portfolio and resume build integration (Astro 5)

Main flow: edit the Obsidian original -> move the same file to 01_Blog_Posts
-> use the existing Git publishing flow -> server preflight -> Astro build.
No per-post Windows prepare command is required once server setup is applied.

Production files:
  package.json, package-lock.json, prepare-portfolio.mjs, render-resume.mjs,
  remark-portfolio.mjs, validate-portfolio.mjs

The candidate update-blog.sh copies those files to
SITE_DIR/node_modules/.portfolio-tools and installs only runtime dependencies
there. Do not install node_modules under src/content/posts/tools: Markdown in
dependencies could be collected as blog posts. This README is .txt for the same
reason. Never publish tools/.preview output as content.

Before building:
  node RUNTIME_DIR/validate-portfolio.mjs POST_DIR
  pnpm exec astro sync --force
  pnpm build

Astro config adds remarkPortfolio first, with postsRoot: './src/content/posts'.
The plugin changes only the in-memory body/AST of the two supported notes,
never source files.
Reading time and excerpt plugins then receive the transformed body.

Sources: exactly 01_Blog_Posts/Portfolio.md and 01_Blog_Posts/이력서.md.
Keep both originals in 작성중/노트 with draft: true while reviewing. When ready,
move the same file to its public path, set published and draft: false, and use
the existing Git publishing flow. Either note can be published independently.
Obsidian native syntax is allowed in these two notes.
Projects: published type: project, portfolio: true, draft: false notes under
01_Blog_Posts. Required properties: unique project_id, project_name,
portfolio_summary, integer portfolio_order, role, technologies list, https
project_url. Report bodies are not rewritten.

Portfolio source needs one pair each of PORTFOLIO_PROJECTS_START/END and
PORTFOLIO_EDITOR_START/END markers. The project region is regenerated from
properties; the editor region is omitted. Obsidian comments, heading/note
wikilinks, callouts and local image embeds are converted in both supported notes.
Code examples remain code. Unresolved links, duplicate IDs and missing images
fail preflight before deployment.

Resume source needs one RESUME_EDITOR_START/END marker pair. That editor region
and Obsidian comments are omitted from public output. If Portfolio is absent
or draft: true, only the resume's Portfolio contact line is omitted with a
warning; its Obsidian original is preserved. Existing self-introduction text,
including company-specific wording, remains for the author to review.
The preflight checks each public note independently, including resume-only use.

Production images must exist under 01_Blog_Posts and be in Git.
portfolio_cover can be [[01_Blog_Posts/_Assets/portfolio/name.png]].
Both notes' frontmatter image must use a normal relative path or https URL,
not a wikilink. Base cards stay native inside the Vault; public output uses
standard Markdown project sections.

Server setup candidates and Korean instructions:
  C:/Project/Career/Blog_Server_설정
These are prepared files; they have not been applied to the server.

Developer checks on Windows (optional):
  npm --prefix C:/Project/Blog-Post/tools ci --ignore-scripts
  npm --prefix C:/Project/Blog-Post/tools test

The older prepare command remains available for a separate local export.
It is not part of the live-sync/server publishing flow, and is not needed for
normal posting. Do not use its standard-Markdown export to overwrite the
Obsidian original in the production Git content store.
