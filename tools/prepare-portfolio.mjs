import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const projectStart = '<!-- PORTFOLIO_PROJECTS_START -->';
const projectEnd = '<!-- PORTFOLIO_PROJECTS_END -->';
const editorStart = '<!-- PORTFOLIO_EDITOR_START -->';
const editorEnd = '<!-- PORTFOLIO_EDITOR_END -->';
const slash = value => value.split(path.sep).join('/');
const mdText = value => String(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>]/g, '\\$&');
const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').trim().replace(/\s+/g, '-');

function frontmatter(text, label) {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${label}: YAML 속성이 필요합니다.`);
  const meta = parse(match[1], { uniqueKeys: true });
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error(`${label}: 잘못된 YAML 속성입니다.`);
  return { meta, body: match[2], header: `---\n${match[1].replace(/\r\n/g, '\n')}\n---\n` };
}

function replaceRegion(text, start, end, replacement) {
  if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(start) >= text.indexOf(end)) {
    throw new Error(`구역 표시가 한 쌍이어야 합니다: ${start}`);
  }
  const a = text.indexOf(start);
  const b = text.indexOf(end) + end.length;
  return text.slice(0, a) + replacement + text.slice(b);
}

async function walk(root) {
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '_Management') continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await walk(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

function httpsUrl(value, label, required = false) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || !/^https:\/\//.test(value)) throw new Error(`${label}: https 주소를 입력하세요.`);
  const url = new URL(value);
  if (!url.hostname || url.username || url.password) throw new Error(`${label}: 잘못된 주소입니다.`);
  return value;
}

function outsideCode(text, transform) {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) => index % 2 ? part : transform(part)).join('');
}

export { frontmatter, walk, httpsUrl, outsideCode, mdText, slug };

export async function preparePortfolio({ vault, repo, dryRun = false, renderOnly = false }) {
  if (!vault || !repo) throw new Error('vault와 repo 경로가 필요합니다.');
  vault = path.resolve(vault);
  repo = path.resolve(repo);
  const writingPath = path.join(vault, '작성중', '노트', 'Portfolio.md');
  const postingPath = path.join(vault, '01_Blog_Posts', 'Portfolio.md');
  const exists = async target => {
    try { await fs.access(target); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const [writingExists, postingExists] = await Promise.all([exists(writingPath), exists(postingPath)]);
  if (writingExists === postingExists) throw new Error(writingExists
    ? 'Portfolio.md가 작성중과 게시 폴더에 모두 있습니다. 편집할 원본을 하나만 유지하세요.'
    : '작성중/노트 또는 01_Blog_Posts에 Portfolio.md가 필요합니다.');
  const mode = postingExists ? 'posting' : 'writing';
  if (renderOnly && !postingExists) throw new Error('서버 렌더링은 01_Blog_Posts/Portfolio.md만 읽습니다.');
  const sourcePath = postingExists ? postingPath : writingPath;
  const outputFolder = postingExists ? '01_Blog_Posts' : path.join('tools', '.preview');
  const source = await fs.readFile(sourcePath, 'utf8');
  const canonical = frontmatter(source, sourcePath);
  if (typeof canonical.meta.draft !== 'boolean') throw new Error('Portfolio draft는 true 또는 false여야 합니다.');
  for (const key of ['title', 'description', 'published']) {
    if (typeof canonical.meta[key] !== 'string' || !canonical.meta[key].trim()) throw new Error(`Portfolio ${key}가 필요합니다.`);
  }
  const files = [...await walk(path.join(vault, '01_Blog_Posts')), ...await walk(path.join(vault, '작성중', '노트'))];
  const projects = [];
  const ids = new Map();
  const warnings = [];
  for (const file of files.filter(file => file.endsWith('.md'))) {
    const text = await fs.readFile(file, 'utf8');
    if (!text.replace(/^\uFEFF/, '').startsWith('---')) continue;
    const note = frontmatter(text, file);
    const m = note.meta;
    if (m.type !== 'project') continue;
    if (m.project_id) {
      if (ids.has(m.project_id)) throw new Error(`project_id 중복: ${m.project_id}\n${ids.get(m.project_id)}\n${file}`);
      ids.set(m.project_id, file);
    }
    if (typeof m.portfolio !== 'boolean' || typeof m.draft !== 'boolean') throw new Error(`${file}: portfolio와 draft는 true/false여야 합니다.`);
    if (!m.portfolio) continue;
    if (m.draft || !slash(path.relative(vault, file)).startsWith('01_Blog_Posts/')) {
      warnings.push(`${m.project_name || path.basename(file)}: 작성 중이므로 게시 목록에서 제외했습니다.`);
      continue;
    }
    if (typeof m.project_id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(m.project_id)) throw new Error(`${file}: 고유 project_id가 필요합니다.`);
    for (const key of ['project_name', 'portfolio_summary', 'role']) {
      if (typeof m[key] !== 'string' || !m[key].trim() || /\[작성:/.test(m[key])) throw new Error(`${file}: ${key}를 실제 내용으로 채우세요.`);
    }
    if (!Number.isSafeInteger(m.portfolio_order)) throw new Error(`${file}: portfolio_order는 정수여야 합니다.`);
    if (!Array.isArray(m.technologies) || !m.technologies.length || m.technologies.some(t => typeof t !== 'string' || !t.trim())) throw new Error(`${file}: technologies는 기술 이름 목록이어야 합니다.`);
    for (const key of ['start_date', 'end_date']) {
      if (m[key] && (typeof m[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m[key]))) throw new Error(`${file}: ${key}는 YYYY-MM-DD 형식이어야 합니다.`);
    }
    if (m.start_date && m.end_date && m.end_date < m.start_date) throw new Error(`${file}: 종료일이 시작일보다 빠릅니다.`);
    if (m.team_size != null && (!Number.isSafeInteger(m.team_size) || m.team_size < 1)) throw new Error(`${file}: team_size는 1 이상의 정수여야 합니다.`);
    httpsUrl(m.project_url, `${file} project_url`, true);
    httpsUrl(m.repository, `${file} repository`);
    httpsUrl(m.demo, `${file} demo`);
    projects.push({ ...note, file, text, relative: slash(path.relative(vault, file)) });
  }
  projects.sort((a, b) => a.meta.portfolio_order - b.meta.portfolio_order || a.meta.project_id.localeCompare(b.meta.project_id));

  const plans = new Map();
  function plan(target, content) {
    if (renderOnly) return;
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (plans.has(target) && !plans.get(target).equals(buffer)) throw new Error(`출력 파일 충돌: ${target}`);
    plans.set(target, buffer);
  }
  const attachments = [...await walk(path.join(vault, '작성중', '첨부')), ...await walk(path.join(vault, '07_Attachments')), ...files.filter(file => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file))];
  const vaultReal = await fs.realpath(vault);
  const postsReal = renderOnly ? await fs.realpath(path.join(vault, '01_Blog_Posts')) : undefined;
  async function image(value, id, alt) {
    if (!value) return '';
    if (typeof value !== 'string') throw new Error(`${id}: 표지 경로는 문자열이어야 합니다.`);
    if (value.startsWith('https://')) return `![${mdText(alt)}](<${httpsUrl(value, '이미지')}>)`;
    const reference = value.replace(/^!?(\[\[)(.*)\]\]$/, '$2').split('|')[0];
    if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(reference)) throw new Error(`${id}: 지원하는 이미지 파일을 연결하세요.`);
    let target;
    if (reference.includes('/') || reference.includes('\\')) target = path.resolve(vault, reference);
    else {
      const matches = attachments.filter(file => path.basename(file) === reference);
      if (matches.length !== 1) throw new Error(`${id}: 이미지가 없거나 파일명이 중복됩니다: ${reference}`);
      [target] = matches;
    }
    let real;
    try { real = await fs.realpath(target); }
    catch { throw new Error(`${id}: 이미지 파일이 없습니다: ${reference}`); }
    const relativeReal = path.relative(vaultReal, real);
    if (relativeReal.startsWith('..') || path.isAbsolute(relativeReal)) throw new Error(`${id}: Vault 안의 이미지를 연결하세요.`);
    if (renderOnly) {
      const publicRelative = path.relative(postsReal, real);
      if (publicRelative.startsWith('..') || path.isAbsolute(publicRelative)) throw new Error(`${id}: 서버 이미지는 01_Blog_Posts 안에 저장하고 Git에 포함하세요.`);
      return `![${mdText(alt)}](<./${slash(path.relative(path.dirname(sourcePath), real))}>)`;
    }
    const assetRelative = path.join('_Assets', 'portfolio', id, path.basename(real));
    const bytes = await fs.readFile(real);
    if (mode === 'posting') plan(path.join(vault, '01_Blog_Posts', assetRelative), bytes);
    plan(path.join(repo, outputFolder, assetRelative), bytes);
    return `![${mdText(alt)}](<./${slash(assetRelative)}>)`;
  }

  const nativeSections = [];
  const webSections = [];
  for (const p of projects) {
    const m = p.meta;
    const heading = `### ${mdText(m.project_name)}`;
    const period = m.start_date ? `${m.start_date}${m.end_date ? ` ~ ${m.end_date}` : ' ~ 진행 중'}` : '';
    const facts = [period, m.team_size ? `${m.team_size}인 프로젝트` : '', m.technologies.map(mdText).join(' · ')].filter(Boolean).join(' | ');
    const common = `${heading}\n\n${facts}\n\n${m.portfolio_summary}\n\n**본인 역할**: ${mdText(m.role)}\n`;
    const nativeImage = m.portfolio_cover ? (m.portfolio_cover.startsWith('https://') ? `![${mdText(m.project_name)}](<${m.portfolio_cover}>)` : `![[${m.portfolio_cover.replace(/^!?(\[\[)(.*)\]\]$/, '$2').split('|')[0]}|720]]`) : '';
    const webImage = await image(m.portfolio_cover, m.project_id, `${m.project_name} 대표 화면`);
    if (!m.portfolio_cover) warnings.push(`${m.project_name}: 대표 이미지는 아직 비어 있습니다.`);
    const external = [m.repository ? `[GitHub](<${m.repository}>)` : '', m.demo ? `[실행 영상](<${m.demo}>)` : ''].filter(Boolean).join(' · ');
    nativeSections.push(`${common}\n${nativeImage ? `${nativeImage}\n\n` : ''}[[${p.relative.replace(/\.md$/, '')}|상세 개발 기록]]${external ? ` · ${external}` : ''}`);
    webSections.push(`${common}\n${webImage ? `${webImage}\n\n` : ''}[상세 개발 기록](<${m.project_url}>)${external ? ` · ${external}` : ''}`);
    if (mode === 'posting') plan(path.join(repo, p.relative), p.text);
  }
  const noProjects = '현재 공개할 프로젝트가 없습니다.';
  const generated = `${projectStart}\n%% 프로젝트 속성으로 갱신됩니다. 이 구역의 요약은 원본 프로젝트 노트에서 수정하세요. %%\n\n${nativeSections.join('\n\n---\n\n') || noProjects}\n${projectEnd}`;
  const updated = replaceRegion(source, projectStart, projectEnd, generated);
  let web = replaceRegion(canonical.body, projectStart, projectEnd, webSections.join('\n\n---\n\n') || noProjects);
  web = replaceRegion(web, editorStart, editorEnd, '');
  if (web.split('%%').length % 2 === 0) throw new Error('Obsidian 주석 %%가 닫히지 않았습니다.');
  web = outsideCode(web, text => text.replace(/%%[\s\S]*?%%/g, ''));
  const headingNames = new Set([...web.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].trim()));
  const linkMap = new Map();
  for (const project of projects) {
    for (const key of new Set([project.relative.replace(/\.md$/, ''), path.basename(project.file, '.md')])) {
      const candidates = linkMap.get(key) || [];
      candidates.push(project);
      linkMap.set(key, candidates);
    }
  }
  const chunks = web.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
  for (let i = 0; i < chunks.length; i += 2) {
    let part = chunks[i];
    const embeds = [...part.matchAll(/!\[\[([^\]]+)\]\]/g)];
    for (const match of embeds) part = part.replace(match[0], await image(match[1], 'portfolio', match[1].split('|')[0]));
    part = part.replace(/\[\[([^\]]+)\]\]/g, (_, inside) => {
      const [reference, alias] = inside.replace(/\\\|/g, '|').split('|');
      const [note, heading] = reference.split('#');
      if (!note && heading && headingNames.has(heading)) return `[${mdText(alias || heading)}](#${slug(heading)})`;
      const candidates = linkMap.get(note.replace(/\.md$/, ''));
      if (!candidates?.length) throw new Error(`게시 주소를 찾을 수 없는 위키 링크: ${reference}`);
      if (candidates.length !== 1) throw new Error(`노트 이름이 중복된 위키 링크입니다. 전체 경로를 적으세요: ${reference}`);
      const [project] = candidates;
      if (heading && ![...project.body.matchAll(/^#{1,6}\s+(.+)$/gm)].some(match => match[1].trim() === heading)) {
        throw new Error(`상세 글에 없는 제목을 가리킵니다: ${reference}`);
      }
      return `[${mdText(alias || path.basename(note))}](<${project.meta.project_url}${heading ? `#${slug(heading)}` : ''}>)`;
    });
    chunks[i] = part.replace(/^>\s*\[!([^\]]+)\][+-]?\s*(.*)$/gm, (_, kind, title) => `> **${title || kind}**`);
  }
  web = chunks.join('').replace(/\n{3,}/g, '\n\n').trim();
  const visible = web.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
  if (/\[작성:|attachment:|<aside|!\[\[|\[\[|\.base#|PORTFOLIO_(?:EDITOR|PROJECTS)_/.test(visible)) throw new Error('게시본에 작성 표시 또는 변환하지 못한 Obsidian/Notion 문법이 남았습니다.');
  const meta = { ...canonical.meta };
  if (meta.image?.startsWith('[[') || meta.image?.startsWith('![[')) {
    if (renderOnly) throw new Error('Portfolio 상단 image는 위키 링크 대신 ./_Assets/... 또는 https 주소를 사용하세요.');
    const converted = await image(meta.image, 'portfolio', 'Portfolio');
    meta.image = converted.match(/\]\(<(.+)>\)$/)[1];
  }
  const output = `---\n${stringify(meta, { lineWidth: 0 })}---\n\n${web}\n`;
  if (renderOnly) return { mode, projects: projects.length, written: [], warnings, body: web, markdown: output, frontmatter: meta };
  plan(sourcePath, updated);
  plan(path.join(repo, outputFolder, 'Portfolio.md'), output);
  const written = [];
  // Validation and asset reads finish before the first write. No Git commands are run.
  for (const [target, bytes] of plans) {
    let old;
    try { old = await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (old?.equals(bytes)) continue;
    written.push(target);
    if (!dryRun) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
    }
  }
  return { mode, projects: projects.length, written, warnings };
}

export async function renderPortfolioMarkdown({ postsRoot }) {
  return preparePortfolio({ vault: postsRoot, repo: postsRoot, renderOnly: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  try {
    const result = await preparePortfolio({
      vault: value('--vault'),
      repo: value('--repo') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      dryRun: args.includes('--dry-run')
    });
    console.log(`프로젝트 ${result.projects}개 · ${args.includes('--dry-run') ? '변경 예정' : '갱신'} ${result.written.length}개 파일`);
    console.log(result.mode === 'writing'
      ? '작성 중: 원본 목록과 tools/.preview/Portfolio.md만 준비합니다. 게시 파일은 만들지 않습니다.'
      : '게시 폴더: Obsidian 원본은 유지하고 저장소의 01_Blog_Posts/Portfolio.md를 갱신합니다.');
    for (const warning of result.warnings) console.log(`안내: ${warning}`);
    console.log('draft는 원본 값을 유지합니다. 커밋·푸시·배포는 실행하지 않았습니다.');
  } catch (error) {
    console.error(`게시 준비 중단: ${error.message}`);
    process.exitCode = 1;
  }
}
