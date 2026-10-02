import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { preparePortfolio } from './prepare-portfolio.mjs';

const portfolioPath = '작성중/노트/Portfolio.md';
const postedPortfolioPath = '01_Blog_Posts/Portfolio.md';
const exportPath = 'tools/.preview/Portfolio.md';
const projectPath = '01_Blog_Posts/Study/프로젝트.md';
const testImage = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const originalBody = '\n# 프로젝트 상세\n\n원래 게시한 본문은 그대로 남아야 합니다.\n';
const portfolioBody = `
# Portfolio

## 수동 소개

직접 작성한 소개를 보존합니다.

[[#수동 소개|소개]]

<!-- PORTFOLIO_PROJECTS_START -->
이전 자동 목록
<!-- PORTFOLIO_PROJECTS_END -->

<!-- PORTFOLIO_EDITOR_START -->
작성 중인 사람에게만 보일 편집 안내
<!-- PORTFOLIO_EDITOR_END -->

## 수동 회고

직접 작성한 회고를 보존합니다.
`;

const portfolioProperties = {
  title: 'Portfolio', created: '2026-09-30', published: '2026-09-30',
  description: '프로젝트 포트폴리오', image: '', tags: [], category: 'Portfolio', draft: true,
};

const projectProperties = {
  title: '프로젝트 상세', created: '2026-09-01', published: '2026-09-02',
  description: '프로젝트 기록', image: '', tags: [], category: 'Study', draft: false,
  type: 'project', project_id: 'sample-project', project_name: '테스트 프로젝트',
  portfolio_summary: '이 프로젝트의 기능을 설명합니다.', role: '개인 개발',
  technologies: ['C++'], portfolio: true, portfolio_order: 10,
  project_url: 'https://example.com/project',
};

function note(properties, body) {
  const yaml = Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

async function write(root, relativePath, data) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}

async function fixture(t, { body = portfolioBody, project = {}, canonical = {} } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'portfolio-prepare-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const vault = path.join(temporary, 'vault');
  const repo = path.join(temporary, 'repo');
  await mkdir(repo, { recursive: true });
  await write(vault, portfolioPath, note({ ...portfolioProperties, ...canonical }, body));
  await write(vault, projectPath, note({ ...projectProperties, ...project }, originalBody));
  return { vault, repo };
}

async function text(root, relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function moveToPosts(context) {
  await mkdir(path.join(context.vault, '01_Blog_Posts'), { recursive: true });
  await rename(path.join(context.vault, portfolioPath), path.join(context.vault, postedPortfolioPath));
  return context;
}

async function assertAbsent(root, relativePath) {
  await assert.rejects(readFile(path.join(root, relativePath)), { code: 'ENOENT' });
}

async function assertNoLegacyPortfolio(context) {
  for (const root of [context.vault, context.repo]) {
    assert.ok(!Object.keys(await snapshot(root)).some(file => path.basename(file) === 'Portfolio123.md'));
  }
}

async function snapshot(root) {
  const files = {};
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files[path.relative(root, absolute)] = (await readFile(absolute)).toString('base64');
    }
  }
  await visit(root);
  return files;
}

async function assertAbortWithoutChanges(context, action) {
  const before = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
  await assert.rejects(action);
  const after = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
  assert.deepEqual(after, before, '실패 시 Vault와 게시 저장소 파일을 변경하면 안 됩니다.');
}

test('작성 중 준비는 미리보기만 내보내고 초안·수동 내용·프로젝트 원본문을 보존한다', async (t) => {
  const context = await fixture(t);
  const sourceProject = await text(context.vault, projectPath);
  const result = await preparePortfolio(context);
  assert.equal(result.mode, 'writing');
  assert.equal(result.projects, 1);
  assert.ok(Array.isArray(result.written));
  assert.ok(Array.isArray(result.warnings));
  const canonical = await text(context.vault, portfolioPath);
  const published = await text(context.repo, exportPath);
  assert.match(canonical, /^draft:\s*true$/m);
  assert.match(published, /^draft:\s*true$/m);
  for (const manual of ['직접 작성한 소개를 보존합니다.', '직접 작성한 회고를 보존합니다.']) {
    assert.ok(canonical.includes(manual));
    assert.ok(published.includes(manual));
  }
  assert.ok(canonical.includes('작성 중인 사람에게만 보일 편집 안내'));
  assert.ok(!published.includes('작성 중인 사람에게만 보일 편집 안내'));
  assert.ok(published.includes('테스트 프로젝트'));
  assert.ok(published.includes('https://example.com/project'));
  assert.ok(!published.includes('[[#수동 소개|소개]]'));
  assert.ok(!published.includes('[['), '게시본에 Obsidian 위키 문법이 남으면 안 됩니다.');
  assert.equal(await text(context.vault, projectPath), sourceProject);
  await assertAbsent(context.vault, postedPortfolioPath);
  await assertAbsent(context.repo, postedPortfolioPath);
  await assertAbsent(context.repo, projectPath);
  const repoFiles = Object.keys(await snapshot(context.repo)).map(file => file.replaceAll(path.sep, '/'));
  assert.ok(repoFiles.every(file => file.startsWith('tools/.preview/')), '작성 중 출력은 Git에 제외된 미리보기 안에만 있어야 합니다.');
  await assertNoLegacyPortfolio(context);
});

test('작성·게시 위치 모두 반복 준비는 동일한 결과를 만든다', async (t) => {
  for (const mode of ['writing', 'posting']) {
    await t.test(mode, async (subtest) => {
      const context = await fixture(subtest);
      if (mode === 'posting') await moveToPosts(context);
      assert.equal((await preparePortfolio(context)).mode, mode);
      const before = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
      await preparePortfolio(context);
      assert.deepEqual(await Promise.all([snapshot(context.vault), snapshot(context.repo)]), before);
    });
  }
});

test('사용자가 원본을 게시 폴더로 이동하면 웹용 게시본을 생성하고 원본은 Obsidian 문법을 유지한다', async (t) => {
  for (const draft of [true, false]) {
    await t.test(`draft=${draft}`, async (subtest) => {
      const context = await fixture(subtest, { canonical: { draft } });
      const sourceProject = await text(context.vault, projectPath);
      await moveToPosts(context);
      const result = await preparePortfolio(context);
      assert.equal(result.mode, 'posting');
      assert.equal(result.projects, 1);
      const canonical = await text(context.vault, postedPortfolioPath);
      const published = await text(context.repo, postedPortfolioPath);
      assert.match(canonical, new RegExp(`^draft:\\s*${draft}$`, 'm'));
      assert.match(published, new RegExp(`^draft:\\s*${draft}$`, 'm'));
      assert.ok(canonical.includes('[[#수동 소개|소개]]'));
      assert.ok(canonical.includes('작성 중인 사람에게만 보일 편집 안내'));
      assert.ok(!published.includes('[['));
      assert.ok(!published.includes('작성 중인 사람에게만 보일 편집 안내'));
      for (const manual of ['직접 작성한 소개를 보존합니다.', '직접 작성한 회고를 보존합니다.']) {
        assert.ok(canonical.includes(manual));
        assert.ok(published.includes(manual));
      }
      assert.equal(await text(context.repo, projectPath), sourceProject);
      assert.equal(await text(context.vault, projectPath), sourceProject);
      await assertAbsent(context.vault, portfolioPath);
      await assertNoLegacyPortfolio(context);
    });
  }
});

test('Portfolio 원본이 작성 중과 게시 폴더에 동시에 있으면 출력 전에 거부한다', async (t) => {
  const context = await fixture(t);
  await write(context.vault, postedPortfolioPath, await text(context.vault, portfolioPath));
  await assertAbortWithoutChanges(context, () => preparePortfolio(context));
});

test('작성 단계에서 게시 단계로 넘어가도 Portfolio123을 다시 만들지 않는다', async (t) => {
  const context = await fixture(t);
  await preparePortfolio(context);
  await assertNoLegacyPortfolio(context);
  await moveToPosts(context);
  await preparePortfolio(context);
  await assertNoLegacyPortfolio(context);
});

test('미발행, 제외, 템플릿, 비공개 노트는 공개 프로젝트 목록에서 제외한다', async (t) => {
  const context = await fixture(t);
  const cases = [
    ['01_Blog_Posts/Study/미발행.md', { project_id: 'draft-project', project_name: '미발행 프로젝트', draft: true }],
    ['01_Blog_Posts/Study/제외.md', { project_id: 'excluded-project', project_name: '제외한 프로젝트', portfolio: false }],
    ['09_Templates/프로젝트.md', { project_id: 'template-project', project_name: '템플릿 프로젝트' }],
    ['작성중/노트/비공개.md', { project_id: 'private-project', project_name: '비공개 프로젝트' }],
  ];
  for (const [file, changes] of cases) await write(context.vault, file, note({ ...projectProperties, ...changes }, originalBody));
  const result = await preparePortfolio(context);
  assert.equal(result.projects, 1);
  const published = await text(context.repo, exportPath);
  for (const [, changes] of cases) assert.ok(!published.includes(changes.project_name));
});

test('비공개 노트와 게시 노트의 중복 ID는 출력 전에 거부한다', async (t) => {
  const context = await fixture(t);
  await write(context.vault, '작성중/노트/중복.md', note({ ...projectProperties, draft: true }, originalBody));
  await assertAbortWithoutChanges(context, () => preparePortfolio(context));
});

test('속성 타입이 잘못된 프로젝트는 출력 전에 거부한다', async (t) => {
  for (const changes of [
    { portfolio: 'true' }, { draft: 'false' }, { portfolio_order: '10' },
    { portfolio_order: null }, { technologies: 'C++' }, { project_url: 'http://example.com/project' },
  ]) {
    await t.test(JSON.stringify(changes), async (subtest) => {
      const context = await fixture(subtest, { project: changes });
      await assertAbortWithoutChanges(context, () => preparePortfolio(context));
    });
  }
});

test('로컬 이미지를 단계에 맞는 미리보기·게시 자산으로 복사하고 위키 문법을 변환한다', async (t) => {
  for (const mode of ['writing', 'posting']) {
    await t.test(mode, async (subtest) => {
      const context = await fixture(subtest, { project: { portfolio_cover: '[[작성중/첨부/test.png]]' } });
      await write(context.vault, '작성중/첨부/test.png', testImage);
      if (mode === 'posting') await moveToPosts(context);
      await preparePortfolio(context);
      const published = await text(context.repo, mode === 'writing' ? exportPath : postedPortfolioPath);
      assert.ok(!published.includes('[['));
      assert.match(published, /(?:<img\b|!\[)/);
      const outputRoot = mode === 'writing' ? 'tools/.preview' : '01_Blog_Posts';
      const files = await snapshot(path.join(context.repo, outputRoot));
      const copied = Object.entries(files).filter(([name, bytes]) => /\.png$/i.test(name) && bytes === testImage.toString('base64'));
      assert.equal(copied.length, 1, '대표 이미지가 현재 출력 경로에 정확히 한 번 복사되어야 합니다.');
      const imageLinks = [...published.matchAll(/!\[[^\]]*\]\(<([^>]+)>\)/g)];
      assert.equal(imageLinks.length, 1);
      const pagePath = path.join(context.repo, mode === 'writing' ? exportPath : postedPortfolioPath);
      const imageTarget = path.resolve(path.dirname(pagePath), imageLinks[0][1]);
      assert.deepEqual(await readFile(imageTarget), testImage, '게시 이미지 링크가 실제 복사 파일을 가리켜야 합니다.');
      assert.deepEqual(await readFile(path.join(context.vault, '작성중/첨부/test.png')), testImage);
      if (mode === 'writing') {
        await assertAbsent(context.repo, postedPortfolioPath);
        await assertAbsent(context.vault, '01_Blog_Posts/_Assets/portfolio/sample-project/test.png');
      }
    });
  }
});

test('대표 이미지가 없거나 위키 링크가 해석되지 않으면 출력 전에 거부한다', async (t) => {
  await t.test('미첨부 대표 이미지', async (subtest) => {
    const context = await fixture(subtest, { project: { portfolio_cover: '[[작성중/첨부/missing.png]]' } });
    await assertAbortWithoutChanges(context, () => preparePortfolio(context));
  });
  await t.test('해석되지 않는 노트 링크', async (subtest) => {
    const context = await fixture(subtest, { body: `${portfolioBody}\n[[없는 노트|상세 보기]]\n` });
    await assertAbortWithoutChanges(context, () => preparePortfolio(context));
  });
});

test('유일한 게시 노트의 짧은 이름 위키 링크를 정상 변환한다', async (t) => {
  const context = await fixture(t, { body: `${portfolioBody}\n[[프로젝트|상세 보기]]\n` });
  await preparePortfolio(context);
  const published = await text(context.repo, exportPath);
  assert.ok(published.includes('[상세 보기](<https://example.com/project>)'));
  assert.ok(!published.includes('[['));
});

test('파일 이름이 같은 게시 노트의 짧은 링크는 모호하므로 출력 전에 거부한다', async (t) => {
  const context = await fixture(t, { body: `${portfolioBody}\n[[프로젝트|상세 보기]]\n` });
  await write(context.vault, '01_Blog_Posts/Other/프로젝트.md', note({
    ...projectProperties, project_id: 'other-project', project_name: '다른 프로젝트',
    project_url: 'https://example.com/other-project', portfolio_order: 20,
  }, originalBody));
  await assertAbortWithoutChanges(context, () => preparePortfolio(context));
});

test('게시 노트에 없는 제목을 가리키는 위키 링크는 출력 전에 거부한다', async (t) => {
  const context = await fixture(t, {
    body: `${portfolioBody}\n[[01_Blog_Posts/Study/프로젝트#없는 제목|상세 보기]]\n`,
  });
  await assertAbortWithoutChanges(context, () => preparePortfolio(context));
});

test('dryRun은 모든 검증을 수행하고 파일을 변경하지 않는다', async (t) => {
  const context = await fixture(t);
  const before = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
  const result = await preparePortfolio({ ...context, dryRun: true });
  assert.equal(result.projects, 1);
  assert.deepEqual(await Promise.all([snapshot(context.vault), snapshot(context.repo)]), before);
});

test('renderOnly는 최신 속성으로 웹 본문을 만들며 반복 실행해도 원본과 출력 파일을 변경하지 않는다', async (t) => {
  const context = await fixture(t, {
    project: { portfolio_summary: '서버 빌드에서 읽은 최신 프로젝트 요약입니다.' },
    canonical: { draft: false },
  });
  await moveToPosts(context);
  const before = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
  const first = await preparePortfolio({ ...context, renderOnly: true });
  const second = await preparePortfolio({ ...context, renderOnly: true });
  assert.equal(first.mode, 'posting');
  assert.equal(first.projects, 1);
  assert.deepEqual(first.written, []);
  assert.equal(first.frontmatter.draft, false);
  assert.equal(first.frontmatter.title, 'Portfolio');
  assert.match(first.markdown, /^---\n/);
  assert.ok(first.body.includes('서버 빌드에서 읽은 최신 프로젝트 요약입니다.'));
  assert.ok(!first.body.includes('이전 자동 목록'));
  assert.ok(!first.body.includes('작성 중인 사람에게만 보일 편집 안내'));
  assert.ok(!first.body.includes('[['));
  assert.ok(first.body.includes('직접 작성한 소개를 보존합니다.'));
  assert.equal(second.body, first.body);
  assert.equal(second.markdown, first.markdown);
  assert.deepEqual(await Promise.all([snapshot(context.vault), snapshot(context.repo)]), before);
});

test('renderOnly의 이미지는 이미 게시 폴더에 있는 파일을 가리키며 복사하지 않는다', async (t) => {
  const context = await fixture(t, { project: { portfolio_cover: '[[01_Blog_Posts/_Assets/test.png]]' } });
  await write(context.vault, '01_Blog_Posts/_Assets/test.png', testImage);
  await moveToPosts(context);
  const before = await Promise.all([snapshot(context.vault), snapshot(context.repo)]);
  const result = await preparePortfolio({ ...context, renderOnly: true });
  const images = [...result.body.matchAll(/!\[[^\]]*\]\(<([^>]+)>\)/g)];
  assert.equal(images.length, 1);
  const target = path.resolve(path.dirname(path.join(context.vault, postedPortfolioPath)), images[0][1]);
  assert.deepEqual(await readFile(target), testImage);
  assert.deepEqual(result.written, []);
  assert.deepEqual(await Promise.all([snapshot(context.vault), snapshot(context.repo)]), before);
});

test('renderOnly는 비공개 첨부와 위키 형식 상단 표지를 변경 없이 거부한다', async (t) => {
  await t.test('비공개 첨부', async (subtest) => {
    const context = await fixture(subtest, { project: { portfolio_cover: '[[작성중/첨부/test.png]]' } });
    await write(context.vault, '작성중/첨부/test.png', testImage);
    await moveToPosts(context);
    await assertAbortWithoutChanges(context, () => preparePortfolio({ ...context, renderOnly: true }));
  });
  await t.test('위키 형식 상단 표지', async (subtest) => {
    const context = await fixture(subtest, { canonical: { image: '[[01_Blog_Posts/_Assets/test.png]]' } });
    await write(context.vault, '01_Blog_Posts/_Assets/test.png', testImage);
    await moveToPosts(context);
    await assertAbortWithoutChanges(context, () => preparePortfolio({ ...context, renderOnly: true }));
  });
});

test('renderOnly는 게시 위치에 없는 원본과 두 위치에 중복된 원본을 변경 없이 거부한다', async (t) => {
  await t.test('작성 중 원본만 존재', async (subtest) => {
    const context = await fixture(subtest);
    await assertAbortWithoutChanges(context, () => preparePortfolio({ ...context, renderOnly: true }));
  });
  await t.test('두 원본 모두 존재', async (subtest) => {
    const context = await fixture(subtest);
    await write(context.vault, postedPortfolioPath, await text(context.vault, portfolioPath));
    await assertAbortWithoutChanges(context, () => preparePortfolio({ ...context, renderOnly: true }));
  });
});
