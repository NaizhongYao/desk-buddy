import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'studio.css'), 'utf8');
const app = readFileSync(join(root, 'app.mjs'), 'utf8');

assert.match(html, /id="toggle-life"/);
assert.match(html, /aria-controls="coding-panel"/);
assert.match(html, /id="coding-panel"/);
assert.match(html, /三个模式都可以点工具栏最右边/);
assert.match(html, /「对话」默认收起右边，打开后只有代码，没有积木/);

assert.match(css, /body\.life-collapsed>\s*main\{grid-template-columns:212px minmax\(0,1fr\)\}/);
assert.match(css, /body\.life-collapsed \.coding\{display:none\}/);
assert.match(css, /\.coding\.talk-code-only \.code-mode-seg/);
assert.match(css, /\.coding\.talk-code-only #blocks-root/);
assert.match(css, /\.coding\.talk-code-only #life-lock\{display:none!important\}/);

assert.match(app, /let lifeOpen=true,lessonLifeOpen=true,talkLifeOpen=false/);
assert.match(app, /function setLifeOpen\(/);
assert.match(app, /function applyTalkEditorChrome\(/);
assert.match(app, /talkLifeOpen=false/);
assert.match(app, /setLifeOpen\(mode==='talk'\?talkLifeOpen:lessonLifeOpen,true\)/);
assert.match(app, /if\(wiringMode==='talk'\) return true/);
assert.match(app, /classList\.toggle\('talk-code-only',talk\)/);
assert.match(app, /if\(wiringMode==='talk'&&mode==='blocks'\)/);
assert.match(app, /\$\('toggle-life'\)\?\.addEventListener\('click'/);
assert.match(app, /对话模式不运行右边的程序/);
assert.doesNotMatch(app, /这一步还不能写积木/);

console.log('PASS: life panel collapse and talk-code-only chrome');
