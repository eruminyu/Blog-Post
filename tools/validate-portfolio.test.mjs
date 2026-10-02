import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('./validate-portfolio.mjs', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'validate-portfolio-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '01_Blog_Posts', 'Study'), { recursive: true });
  return root;
}

function note(properties, body) {
  return `---\n${Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}`;
}

async function snapshot(root) {
  const files = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else files[path.relative(root, target)] = (await readFile(target)).toString('base64');
    }
  }
  await visit(root);
  return files;
}

test('검증 CLI는 아직 게시 원본이 없으면 성공으로 건너뛰고 아무 파일도 쓰지 않는다', async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  const result = await execute(process.execPath, [cli, root]);
  assert.match(result.stdout, /validation skipped/i);
  assert.deepEqual(await snapshot(root), before);
});

test('검증 CLI는 잘못된 게시 원본이면 실패 상태를 반환하고 원본을 변경하지 않는다', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '01_Blog_Posts', 'Portfolio.md'), '# YAML이 없는 Portfolio\n');
  const before = await snapshot(root);
  await assert.rejects(execute(process.execPath, [cli, root]), error => {
    assert.ok(Number.isInteger(error.code) && error.code !== 0);
    assert.match(error.stderr, /Portfolio validation FAILED/);
    return true;
  });
  assert.deepEqual(await snapshot(root), before);
});

test('검증 CLI는 유효한 게시 원본을 성공으로 검사하며 프로젝트 파일도 변경하지 않는다', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '01_Blog_Posts', 'Portfolio.md'), note({
    title: 'Portfolio', published: '2026-10-02', description: 'Portfolio description',
    image: '', tags: [], category: 'Portfolio', draft: true,
  }, '# Portfolio\n<!-- PORTFOLIO_PROJECTS_START -->\n캐시\n<!-- PORTFOLIO_PROJECTS_END -->\n<!-- PORTFOLIO_EDITOR_START -->\n편집자 안내\n<!-- PORTFOLIO_EDITOR_END -->\n'));
  await writeFile(path.join(root, '01_Blog_Posts', 'Study', '프로젝트.md'), note({
    title: '프로젝트', published: '2026-10-02', description: 'Project description',
    image: '', tags: [], category: 'Study', draft: false, type: 'project',
    project_id: 'cli-project', project_name: 'CLI 프로젝트', portfolio_summary: '실제 프로젝트 요약',
    role: '개인 개발', technologies: ['C++'], portfolio: true, portfolio_order: 1,
    project_url: 'https://example.com/cli-project',
  }, '# 프로젝트\n\n원본문\n'));
  const before = await snapshot(root);
  const result = await execute(process.execPath, [cli, root]);
  assert.match(result.stdout, /Portfolio validated: 1 projects, draft=true/);
  assert.deepEqual(await snapshot(root), before);
});

test('검증 CLI는 Portfolio 없이 이력서만 게시해도 검증하며 원본과 초안 상태를 보존한다', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '01_Blog_Posts', '이력서.md'), note({
    title: '이력서', published: '2026-10-02', description: '스터디 검토용 이력서',
    image: '', tags: [], category: 'Career', draft: true,
  }, '# 이력서\n\n## 경력\n\n[[#경력|바로가기]]\n\n<!-- RESUME_EDITOR_START -->\n편집자 안내\n<!-- RESUME_EDITOR_END -->\n'));
  const before = await snapshot(root);
  const result = await execute(process.execPath, [cli, root]);
  assert.match(result.stdout, /(?:Resume|이력서) validated.*draft=true/i);
  assert.deepEqual(await snapshot(root), before);
});

test('검증 CLI는 Portfolio가 유효해도 게시 이력서의 변환 실패를 실패 상태로 반환한다', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '01_Blog_Posts', 'Portfolio.md'), note({
    title: 'Portfolio', published: '2026-10-02', description: 'Portfolio description',
    image: '', tags: [], category: 'Portfolio', draft: true,
  }, '# Portfolio\n<!-- PORTFOLIO_PROJECTS_START -->\n캐시\n<!-- PORTFOLIO_PROJECTS_END -->\n<!-- PORTFOLIO_EDITOR_START -->\n편집자 안내\n<!-- PORTFOLIO_EDITOR_END -->\n'));
  await writeFile(path.join(root, '01_Blog_Posts', '이력서.md'), note({
    title: '이력서', published: '2026-10-02', description: '스터디 검토용 이력서',
    image: '', tags: [], category: 'Career', draft: false,
  }, '# 이력서\n\n[[없는 비공개 노트|참고]]\n'));
  const before = await snapshot(root);
  await assert.rejects(execute(process.execPath, [cli, root]), error => {
    assert.ok(Number.isInteger(error.code) && error.code !== 0);
    assert.match(error.stderr, /validation FAILED/);
    return true;
  });
  assert.deepEqual(await snapshot(root), before);
});
