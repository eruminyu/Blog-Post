import fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { frontmatter, walk, httpsUrl, outsideCode, mdText, slug } from './prepare-portfolio.mjs';

const editorStart = '<!-- RESUME_EDITOR_START -->';
const editorEnd = '<!-- RESUME_EDITOR_END -->';
const slash = value => value.split(path.sep).join('/');
const headings = body => new Set([...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].trim()));

// Read-only: default to the moved public original. sourcePath is for local previews.
export async function renderResumeMarkdown({ postsRoot, sourcePath, siteUrl = 'https://blog.serian.live/' }) {
  if (!postsRoot) throw new Error('postsRoot 경로가 필요합니다.');
  postsRoot = path.resolve(postsRoot);
  const publicFolder = path.join(postsRoot, '01_Blog_Posts');
  sourcePath = path.resolve(sourcePath || path.join(publicFolder, '이력서.md'));
  const canonical = frontmatter(await fs.readFile(sourcePath, 'utf8'), sourcePath);
  for (const key of ['title', 'description', 'published']) {
    if (typeof canonical.meta[key] !== 'string' || !canonical.meta[key].trim()) throw new Error(`이력서 ${key}가 필요합니다.`);
  }
  if (typeof canonical.meta.draft !== 'boolean') throw new Error('이력서 draft는 true 또는 false여야 합니다.');
  if (canonical.meta.image !== undefined && typeof canonical.meta.image !== 'string') throw new Error('이력서 image는 문자열이어야 합니다.');
  if (canonical.meta.image?.startsWith('[[') || canonical.meta.image?.startsWith('![[')) throw new Error('이력서 상단 image는 일반 상대 경로 또는 https 주소를 사용하세요.');
  httpsUrl(siteUrl, '블로그 주소', true);

  let web = canonical.body;
  if (web.split(editorStart).length !== 2 || web.split(editorEnd).length !== 2 || web.indexOf(editorStart) >= web.indexOf(editorEnd)) {
    throw new Error('이력서 편집 구역 RESUME_EDITOR_START/END가 한 쌍이어야 합니다.');
  }
  web = web.slice(0, web.indexOf(editorStart)) + web.slice(web.indexOf(editorEnd) + editorEnd.length);
  web = outsideCode(web, part => {
    if (part.split('%%').length % 2 === 0) throw new Error('Obsidian 주석 %%가 닫히지 않았습니다.');
    return part.replace(/%%[\s\S]*?%%/g, '');
  });

  const files = await walk(publicFolder);
  const noteMap = new Map();
  for (const file of files.filter(file => file.endsWith('.md'))) {
    const text = await fs.readFile(file, 'utf8');
    if (!text.replace(/^\uFEFF/, '').startsWith('---')) continue;
    const note = { ...frontmatter(text, file), file };
    const relative = slash(path.relative(postsRoot, file)).replace(/\.md$/, '');
    const aliases = Array.isArray(note.meta.aliases) ? note.meta.aliases.filter(alias => typeof alias === 'string') : [];
    for (const key of new Set([relative, path.basename(file, '.md'), ...aliases])) {
      const candidates = noteMap.get(key) || [];
      candidates.push(note);
      noteMap.set(key, candidates);
    }
  }
  const warnings = [];
  const portfolio = (noteMap.get('Portfolio') || []).find(note => note.meta.draft === false);
  if (!portfolio) {
    web = outsideCode(web, part => part.replace(/^- 포트폴리오:\s*\[\[(?:Portfolio|포트폴리오)(?:\.md)?(?:\|[^\]]+)?\]\]\s*$/gm, () => {
      warnings.push('Portfolio가 아직 공개되지 않아 연락처의 Portfolio 링크를 게시본에서 제외했습니다.');
      return '';
    }));
  }
  const headingNames = headings(web);
  const publicReal = await fs.realpath(publicFolder);
  async function assertPublicImage(target, reference) {
    let real;
    try { real = await fs.realpath(target); }
    catch { throw new Error(`이미지 파일이 없습니다: ${reference}`); }
    const relative = path.relative(publicReal, real);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('이력서 공개 이미지는 01_Blog_Posts 안에 저장하고 Git에 포함하세요.');
    if (!(await fs.stat(real)).isFile()) throw new Error(`이미지 파일이 아닙니다: ${reference}`);
    return real;
  }
  async function validateImageReference(reference) {
    if (/^https?:\/\//.test(reference)) { httpsUrl(reference, '이미지', true); return; }
    const local = decodeURIComponent(reference.split(/[?#]/)[0]);
    await assertPublicImage(path.resolve(path.dirname(sourcePath), local), reference);
  }
  if (canonical.meta.image) await validateImageReference(canonical.meta.image);
  async function image(reference) {
    reference = reference.split('|')[0];
    if (reference.startsWith('https://')) return `![이미지](<${httpsUrl(reference, '이미지')}>)`;
    if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(reference)) throw new Error(`지원하지 않는 이력서 이미지 또는 노트 삽입: ${reference}`);
    let target;
    if (reference.startsWith('./') || reference.startsWith('../')) target = path.resolve(path.dirname(sourcePath), reference);
    else if (reference.includes('/') || reference.includes('\\')) target = path.resolve(postsRoot, reference);
    else {
      const candidates = files.filter(file => path.basename(file) === reference);
      if (candidates.length !== 1) throw new Error(`이미지가 없거나 이름이 중복됩니다: ${reference}`);
      [target] = candidates;
    }
    const real = await assertPublicImage(target, reference);
    return `![${mdText(path.basename(real))}](<./${slash(path.relative(path.dirname(sourcePath), real))}>)`;
  }
  function noteUrl(note) {
    if (note.meta.project_url) return httpsUrl(note.meta.project_url, '게시 주소', true);
    const segments = slash(path.relative(postsRoot, note.file)).replace(/\.md$/, '').split('/').map(slug);
    return new URL(`posts/${segments.join('/')}/`, siteUrl).href;
  }
  const chunks = web.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
  for (let index = 0; index < chunks.length; index += 2) {
    let part = chunks[index];
    for (const match of [...part.matchAll(/!\[\[([^\]]+)\]\]/g)]) part = part.replace(match[0], await image(match[1]));
    part = part.replace(/\[\[([^\]]+)\]\]/g, (_, inside) => {
      const [reference, alias] = inside.replace(/\\\|/g, '|').split('|');
      const [noteName, heading] = reference.split('#');
      if (!noteName && heading && headingNames.has(heading)) return `[${mdText(alias || heading)}](#${slug(heading)})`;
      const candidates = noteMap.get(noteName.replace(/\.md$/, ''));
      if (candidates?.length !== 1) throw new Error(`없는 노트 또는 이름이 중복된 위키 링크: ${reference}`);
      const [note] = candidates;
      if (heading && !headings(note.body).has(heading)) throw new Error(`노트에 없는 제목을 가리킵니다: ${reference}`);
      if (path.resolve(note.file) !== sourcePath && note.meta.draft !== false) throw new Error(`미공개 노트를 가리키는 위키 링크: ${reference}`);
      const url = path.resolve(note.file) === sourcePath ? '' : noteUrl(note);
      const destination = `${url}${heading ? `#${slug(heading)}` : ''}`.replace(/[()\s]/g, character => encodeURIComponent(character));
      return `[${mdText(alias || path.basename(noteName))}](${destination})`;
    });
    for (const match of part.matchAll(/!\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g)) {
      await validateImageReference(match[1] || match[2]);
    }
    chunks[index] = part.replace(/^>\s*\[!([^\]]+)\][+-]?\s*(.*)$/gm, (_, kind, title) => `> **${title || kind}**`);
  }
  web = chunks.join('').replace(/\n{3,}/g, '\n\n').trim();
  const visible = outsideCode(web, part => part).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
  if (/\[작성:|attachment:|<aside|!\[\[|\[\[|\.base#|RESUME_EDITOR_|%%/.test(visible)) throw new Error('이력서 게시본에 편집 표시 또는 변환하지 못한 문법이 남았습니다.');
  return { body: web, markdown: `---\n${stringify(canonical.meta, { lineWidth: 0 })}---\n\n${web}\n`, frontmatter: canonical.meta, written: [], warnings };
}
