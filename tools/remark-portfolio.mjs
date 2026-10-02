import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPortfolioMarkdown } from './prepare-portfolio.mjs';
import { renderResumeMarkdown } from './render-resume.mjs';

// Transform only the public AST. Never rewrite Git-tracked source or assets.
export default function remarkPortfolio({ postsRoot = './src/content/posts', siteUrl = 'https://blog.serian.live/' } = {}) {
  const processor = this;
  const root = path.resolve(postsRoot instanceof URL ? fileURLToPath(postsRoot) : postsRoot);
  const portfolioPath = path.join(root, '01_Blog_Posts', 'Portfolio.md');
  const resumePath = path.join(root, '01_Blog_Posts', '이력서.md');
  return async function transform(tree, file) {
    if (!file.path) return tree;
    const target = path.resolve(file.path);
    if (target !== portfolioPath && target !== resumePath) return tree;
    const rendered = target === portfolioPath
      ? await renderPortfolioMarkdown({ postsRoot: root })
      : await renderResumeMarkdown({ postsRoot: root, siteUrl });
    file.value = rendered.body;
    return processor.parse(rendered.body);
  };
}
