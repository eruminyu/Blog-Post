import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderResumeMarkdown } from './render-resume.mjs';

const resumePath = '01_Blog_Posts/이력서.md';
const reportPath = '01_Blog_Posts/Study/개발 기록.md';
const image = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const meta = {
  title: '임민성 이력서', created: '2026-10-02', published: '2026-10-02',
  description: '스터디 검토용 이력서', image: '', tags: ['Resume'], category: 'Career', draft: true,
};
const body = `# 임민성

> [!info] 스터디 검토용
> 내 역할과 AI 구현을 구분한 이력서입니다.

- 이메일: [resume@example.com](mailto:resume@example.com)
- 포트폴리오: [[Portfolio|게임 개발 포트폴리오]]

[[#기술과 학습 경험|기술]] · [[#제출 자기소개서|자기소개서]]

## 기술과 학습 경험

본인 역할과 AI 기여를 직접 설명한 문장입니다.

[[01_Blog_Posts/Study/개발 기록|상세 결과 보고서]]

| 자료 | 링크 |
| --- | --- |
| 보고서 | [[개발 기록\\|별칭 링크]] |

%% 이 메모는 공개하지 않습니다. %%

## 제출 자기소개서

넥슨과 넥토리얼에 제출한 자기소개서 원문을 유지합니다.

\`\`\`md
[[코드 예시|원문]]
%% 코드 속 주석 %%
\`\`\`

<!-- RESUME_EDITOR_START -->
## 작성자 확인

![[08_Base/프로젝트 리스트.base#포트폴리오]]
[작성: 편집자에게만 보일 안내]
<!-- RESUME_EDITOR_END -->
`;

function note(properties, contents) {
  return `---\n${Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${contents}`;
}

async function write(root, relative, value) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
}

async function fixture(t, { contents = body, properties = {}, report = {} } = {}) {
  const postsRoot = await mkdtemp(path.join(os.tmpdir(), 'resume-render-test-'));
  t.after(() => rm(postsRoot, { recursive: true, force: true }));
  await write(postsRoot, resumePath, note({ ...meta, ...properties }, contents));
  await write(postsRoot, reportPath, note({
    title: '개발 기록', published: '2026-10-02', description: '프로젝트 결과 보고서',
    image: '', tags: [], category: 'Study', draft: false,
    project_url: 'https://example.com/development-report', ...report,
  }, '# 개발 기록\n\n원본 보고서입니다.\n'));
  return { postsRoot };
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

async function assertReadOnlyFailure(context, options = {}) {
  const before = await snapshot(context.postsRoot);
  await assert.rejects(renderResumeMarkdown({ ...context, ...options }));
  assert.deepEqual(await snapshot(context.postsRoot), before);
}

test('공개 변환은 초안·수동 이력서·제출 자기소개서를 유지하며 편집 영역과 Obsidian 문법을 제거한다', async (t) => {
  const context = await fixture(t);
  const before = await snapshot(context.postsRoot);
  const result = await renderResumeMarkdown(context);
  assert.equal(result.frontmatter.draft, true);
  assert.deepEqual(result.written, []);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.body.includes('본인 역할과 AI 기여를 직접 설명한 문장입니다.'));
  assert.ok(result.body.includes('넥슨과 넥토리얼에 제출한 자기소개서 원문을 유지합니다.'));
  assert.ok(result.body.includes('[resume@example.com](mailto:resume@example.com)'));
  assert.ok(result.body.includes('[기술](#기술과-학습-경험)'));
  assert.ok(result.body.includes('[자기소개서](#제출-자기소개서)'));
  assert.ok(result.body.includes('[상세 결과 보고서](https://example.com/development-report)'));
  assert.ok(result.body.includes('[별칭 링크](https://example.com/development-report)'));
  assert.ok(!result.body.includes('[!info]'));
  assert.ok(!result.body.includes('이 메모는 공개하지 않습니다.'));
  assert.ok(!result.body.includes('RESUME_EDITOR_'));
  assert.ok(!result.body.includes('작성자 확인'));
  assert.ok(!result.body.includes('[작성:'));
  assert.ok(!result.body.includes('.base'));
  assert.ok(result.body.includes('```md\n[[코드 예시|원문]]\n%% 코드 속 주석 %%\n```'));
  assert.match(result.markdown, /^---\r?\n/);
  assert.match(result.markdown, /^draft:\s*true$/m);
  assert.equal((await renderResumeMarkdown(context)).body, result.body);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('Portfolio가 아직 없거나 초안이면 연락처의 Portfolio 링크만 생략하고 경고한다', async (t) => {
  for (const mode of ['missing', 'draft']) {
    await t.test(mode, async (subtest) => {
      const context = await fixture(subtest);
      if (mode === 'draft') await write(context.postsRoot, '01_Blog_Posts/Portfolio.md', note({ ...meta, title: 'Portfolio' }, '# Portfolio\n'));
      const before = await snapshot(context.postsRoot);
      const result = await renderResumeMarkdown(context);
      assert.ok(!result.body.includes('- 포트폴리오:'));
      assert.ok(result.warnings.length > 0);
      assert.ok(result.body.includes('mailto:resume@example.com'));
      assert.deepEqual(await snapshot(context.postsRoot), before);
    });
  }
});

test('게시 가능한 Portfolio가 있으면 실제 블로그 게시 주소로 연락처 링크를 연결한다', async (t) => {
  const context = await fixture(t);
  await write(context.postsRoot, '01_Blog_Posts/Portfolio.md', note({ ...meta, title: 'Portfolio', draft: false }, '# Portfolio\n'));
  const result = await renderResumeMarkdown(context);
  assert.ok(result.body.includes('[게임 개발 포트폴리오](https://blog.serian.live/posts/01_blog_posts/portfolio/)'));
});

test('공개 이미지 위키 링크는 실제 파일의 상대 경로로 변환하고 아무 파일도 복사하지 않는다', async (t) => {
  const context = await fixture(t, { contents: `${body}\n![[01_Blog_Posts/_Assets/resume/photo.png|720]]\n` });
  await write(context.postsRoot, '01_Blog_Posts/_Assets/resume/photo.png', image);
  const before = await snapshot(context.postsRoot);
  const result = await renderResumeMarkdown(context);
  const matches = [...result.body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  assert.equal(matches.length, 1);
  const imagePath = matches[0][1].replace(/^<|>$/g, '');
  const target = path.resolve(context.postsRoot, '01_Blog_Posts', imagePath);
  assert.deepEqual(await readFile(target), image);
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('sourcePath는 작성중 원본 미리보기에 사용할 수 있고 초안 상태와 공개 이미지 경로를 유지한다', async (t) => {
  const context = await fixture(t);
  const sourcePath = await write(context.postsRoot, '작성중/노트/이력서.md', note(meta, `${body}\n![[01_Blog_Posts/_Assets/resume/preview.png]]\n`));
  await write(context.postsRoot, '01_Blog_Posts/_Assets/resume/preview.png', image);
  const before = await snapshot(context.postsRoot);
  const result = await renderResumeMarkdown({ ...context, sourcePath });
  assert.equal(result.frontmatter.draft, true);
  assert.deepEqual(result.written, []);
  assert.ok(!result.body.includes('![[01_Blog_Posts'));
  assert.deepEqual(await snapshot(context.postsRoot), before);
});

test('공개하지 않은 노트·해결되지 않은 링크·비공개 이미지는 변환을 실패시키고 원본을 보존한다', async (t) => {
  for (const [name, contents, extra] of [
    ['unknown note', `${body}\n[[없는 노트]]\n`],
    ['private note', `${body}\n[[작성중/노트/비공개 메모|참고]]\n`, ['작성중/노트/비공개 메모.md', note(meta, '# 비공개 메모\n')]],
    ['missing native image', `${body}\n![[01_Blog_Posts/_Assets/missing.png]]\n`],
    ['private native image', `${body}\n![[작성중/첨부/private.png]]\n`, ['작성중/첨부/private.png', image]],
    ['missing standard image', `${body}\n![missing](_Assets/missing.png)\n`],
  ]) {
    await t.test(name, async (subtest) => {
      const context = await fixture(subtest, { contents });
      if (extra) await write(context.postsRoot, extra[0], extra[1]);
      await assertReadOnlyFailure(context);
    });
  }
});

test('중복된 노트명·초안 보고서·없는 제목 링크를 공개 주소로 임의 해석하지 않는다', async (t) => {
  await t.test('ambiguous basename', async (subtest) => {
    const context = await fixture(subtest);
    await write(context.postsRoot, '01_Blog_Posts/Other/개발 기록.md', note({ ...meta, draft: false }, '# 개발 기록\n'));
    await assertReadOnlyFailure(context);
  });
  await t.test('draft target', async (subtest) => {
    const context = await fixture(subtest, { report: { draft: true } });
    await assertReadOnlyFailure(context);
  });
  await t.test('missing heading', async (subtest) => {
    const context = await fixture(subtest, { contents: `${body}\n[[#없는 제목|바로가기]]\n` });
    await assertReadOnlyFailure(context);
  });
});

test('편집 마커의 짝이 맞지 않거나 중복되면 일부 내용만 공개하지 않고 실패한다', async (t) => {
  for (const contents of [
    body.replace('<!-- RESUME_EDITOR_END -->', ''),
    body.replace('<!-- RESUME_EDITOR_START -->', ''),
    `${body}\n<!-- RESUME_EDITOR_START -->\n두 번째 편집 영역\n<!-- RESUME_EDITOR_END -->\n`,
  ]) {
    const context = await fixture(t, { contents });
    await assertReadOnlyFailure(context);
  }
});

test('Frontmatter의 image 위키 링크와 중복 YAML 속성은 공개 빌드 전에 실패시킨다', async (t) => {
  await t.test('native header image', async (subtest) => {
    const context = await fixture(subtest, { properties: { image: '[[01_Blog_Posts/_Assets/header.png]]' } });
    await write(context.postsRoot, '01_Blog_Posts/_Assets/header.png', image);
    await assertReadOnlyFailure(context);
  });
  await t.test('duplicate YAML key', async (subtest) => {
    const context = await fixture(subtest);
    await write(context.postsRoot, resumePath, note(meta, body).replace('draft: true', 'draft: true\ndraft: false'));
    await assertReadOnlyFailure(context);
  });
});
