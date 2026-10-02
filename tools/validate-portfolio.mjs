import fs from 'node:fs/promises';
import path from 'node:path';
import { renderPortfolioMarkdown } from './prepare-portfolio.mjs';
import { renderResumeMarkdown } from './render-resume.mjs';

const postsRoot = path.resolve(process.argv[2] || './src/content/posts');
let currentDocument = 'Blog';
try {
  for (const [filename, label, render] of [
    ['Portfolio.md', 'Portfolio', renderPortfolioMarkdown],
    ['이력서.md', 'Resume', renderResumeMarkdown],
  ]) {
    currentDocument = label;
    try { await fs.access(path.join(postsRoot, '01_Blog_Posts', filename)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.log(`${label} is not in the posting folder yet; validation skipped.`);
      continue;
    }
    const result = await render({ postsRoot });
    console.log(`${label} validated: ${result.projects == null ? '' : `${result.projects} projects, `}draft=${result.frontmatter.draft}. Source files preserved.`);
    for (const warning of result.warnings) console.log(`Note: ${warning}`);
  }
} catch (error) {
  console.error(`${currentDocument} validation FAILED: ${error.message}`);
  process.exitCode = 1;
}
