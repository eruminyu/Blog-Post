import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { VFile } from 'vfile';
import remarkPortfolio from './remark-portfolio.mjs';

const image = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const nativeBody = `# Portfolio

> [!abstract] 개발 프로젝트 소개
> 직접 작성한 소개입니다.

## 직접 쓴 소개

[[#직접 쓴 소개|소개로 이동]]

<!-- PORTFOLIO_PROJECTS_START -->
오래된 캐시 요약
<!-- PORTFOLIO_PROJECTS_END -->

<!-- PORTFOLIO_EDITOR_START -->
## 편집자 전용 안내

![[08_Base/프로젝트 리스트.base#포트폴리오]]
[작성: 삭제할 표시]
<!-- PORTFOLIO_EDITOR_END -->

%% 게시하면 보이면 안 되는 주석 %%
`;

function note(meta, body) {
  return `---\n${Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}`;
}

async function write(root, relative, value) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
}

async function fixture(t, withCover = false) {
  const postsRoot = await mkdtemp(path.join(os.tmpdir(), 'remark-portfolio-test-'));
  t.after(() => rm(postsRoot, { recursive: true, force: true }));
  const portfolioPath = await write(postsRoot, '01_Blog_Posts/Portfolio.md', note({
    title: 'Portfolio', created: '2026-09-30', published: '2026-10-02',
    description: 'Portfolio description', image: '', tags: [], category: 'Portfolio', draft: false,
  }, nativeBody));
  await write(postsRoot, '01_Blog_Posts/Study/개발 기록.md', note({
    title: '개발 기록', created: '2026-09-01', published: '2026-09-02',
    description: 'Project description', image: '', tags: [], category: 'Study', draft: false,
    type: 'project', project_id: 'current-project', project_name: '현재 프로젝트',
    portfolio_summary: '갱신된 최신 프로젝트 속성 요약', role: '게임 구현', technologies: ['C++'],
    portfolio: true, portfolio_order: 1, project_url: 'https://example.com/current-project',
    portfolio_cover: withCover ? '[[01_Blog_Posts/_Assets/cover.png]]' : '',
  }, '# 개발 기록\n\n상세 글 원본은 변경하지 않습니다.\n'));
  if (withCover) await write(postsRoot, '01_Blog_Posts/_Assets/cover.png', image);
  return { postsRoot, portfolioPath };
}

function nodes(tree, type) {
  return [tree.type === type ? tree : undefined, ...(tree.children || []).flatMap(child => nodes(child, type))].filter(Boolean);
}

async function snapshot(root) {
  const files = {};
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else files[path.relative(root, target)] = (await readFile(target)).toString('base64');
    }
  }
  await visit(root);
  return files;
}

function processor(postsRoot) {
  return unified().use(remarkParse).use(remarkGfm).use(remarkPortfolio, { postsRoot });
}

async function transform(context, filePath = context.portfolioPath, value) {
  const contents = value ?? await readFile(filePath, 'utf8');
  const parser = processor(context.postsRoot);
  return parser.run(parser.parse(contents), { path: filePath, value: contents });
}

test('Portfolio AST는 최신 프로젝트 속성으로 재생성하고 Obsidian 작성 문법을 제거한다', async (t) => {
  const context = await fixture(t);
  const before = await snapshot(context.postsRoot);
  const first = await transform(context);
  const second = await transform(context);
  const texts = nodes(first, 'text').map(node => node.value).join('\n');
  assert.ok(texts.includes('갱신된 최신 프로젝트 속성 요약'));
  assert.ok(texts.includes('직접 작성한 소개입니다.'));
  assert.ok(!texts.includes('오래된 캐시 요약'));
  assert.ok(!texts.includes('편집자 전용 안내'));
  assert.ok(!texts.includes('[!abstract]'));
  assert.ok(!texts.includes('[['));
  assert.ok(!texts.includes('[작성:'));
  assert.ok(!texts.includes('게시하면 보이면 안 되는 주석'));
  const links = nodes(first, 'link');
  assert.ok(links.some(link => link.url === 'https://example.com/current-project'));
  assert.ok(links.some(link => link.url === '#직접-쓴-소개'));
  assert.ok(nodes(first, 'strong').some(node => nodes(node, 'text').some(text => text.value === '개발 프로젝트 소개')));
  assert.ok(!nodes(first, 'html').some(node => /PORTFOLIO_|\.base/.test(node.value)));
  assert.deepEqual(second, first);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('Portfolio AST 이미지 주소는 실제 공개 파일을 가리키며 새 파일을 생성하지 않는다', async (t) => {
  const context = await fixture(t, true);
  const before = await snapshot(context.postsRoot);
  const tree = await transform(context);
  const images = nodes(tree, 'image');
  assert.equal(images.length, 1);
  assert.ok(!images[0].url.includes('[['));
  const target = path.resolve(path.dirname(context.portfolioPath), images[0].url);
  assert.deepEqual(await readFile(target), image);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('Portfolio·이력서 이외의 기존 게시 노트는 AST와 원본을 그대로 통과시킨다', async (t) => {
  const context = await fixture(t);
  const otherPath = await write(context.postsRoot, '01_Blog_Posts/Study/다른 글.md', '# 다른 글\n\n[[원래의 위키 링크]]\n');
  const before = await snapshot(context.postsRoot);
  const contents = await readFile(otherPath, 'utf8');
  const parser = processor(context.postsRoot);
  const input = parser.parse(contents);
  const expected = structuredClone(input);
  const output = await parser.run(input, { path: otherPath, value: contents });
  assert.deepEqual(output, expected);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('이력서 AST와 VFile 본문은 공개용으로 변환하며 제출 자기소개서와 원본 파일을 보존한다', async (t) => {
  const context = await fixture(t);
  const resumePath = await write(context.postsRoot, '01_Blog_Posts/이력서.md', note({
    title: '이력서', created: '2026-10-02', published: '2026-10-02',
    description: '스터디 검토용 이력서', image: '', tags: ['Resume'], category: 'Career', draft: true,
  }, '# 이력서\n\n## 경력\n\n[[#경력|경력으로 이동]]\n\n[[개발 기록|상세 보고서]]\n\n## 자기소개서\n\n넥슨에 제출한 자기소개서 원문입니다.\n\n%% 공개하지 않을 메모 %%\n\n<!-- RESUME_EDITOR_START -->\n[작성: 편집자 안내]\n<!-- RESUME_EDITOR_END -->\n'));
  const before = await snapshot(context.postsRoot);
  const contents = await readFile(resumePath, 'utf8');
  const parser = processor(context.postsRoot);
  const file = new VFile({ path: resumePath, value: contents });
  const tree = await parser.run(parser.parse(contents), file);
  const texts = nodes(tree, 'text').map(node => node.value).join('\n');
  assert.ok(texts.includes('넥슨에 제출한 자기소개서 원문입니다.'));
  assert.ok(!texts.includes('공개하지 않을 메모'));
  assert.ok(!texts.includes('[작성:'));
  assert.ok(!texts.includes('[['));
  assert.ok(nodes(tree, 'link').some(link => link.url === '#경력'));
  assert.ok(nodes(tree, 'link').some(link => link.url === 'https://example.com/current-project'));
  assert.ok(!String(file.value).includes('RESUME_EDITOR_'));
  assert.ok(!String(file.value).includes('[['));
  assert.ok(!String(file.value).includes('공개하지 않을 메모'));
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('작성중 이력서는 게시 이력서와 이름이 같아도 AST를 변환하지 않는다', async (t) => {
  const context = await fixture(t);
  const privatePath = await write(context.postsRoot, '작성중/노트/이력서.md', '# 작성중 이력서\n\n[[검토용 메모]]\n');
  const contents = await readFile(privatePath, 'utf8');
  const parser = processor(context.postsRoot);
  const input = parser.parse(contents);
  const expected = structuredClone(input);
  const file = { path: privatePath, value: contents };
  const before = await snapshot(context.postsRoot);
  assert.deepEqual(await parser.run(input, file), expected);
  assert.equal(file.value, contents);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});
