import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'src', 'assets']) {
  await cp(new URL(file, root), new URL(file, dist), { recursive: true });
}
// Version the complete module graph so returning visitors never mix releases.
const modules = (await readdir(new URL('src/', dist))).filter(file => file.endsWith('.js')).sort();
const sources = await Promise.all(modules.map(file => readFile(new URL(`src/${file}`, dist), 'utf8')));
const css = await readFile(new URL('styles.css', dist), 'utf8');
const version = createHash('sha256').update([...sources, css].join('\n')).digest('hex').slice(0, 12);
for (const [index, file] of modules.entries()) {
  const content = sources[index].replace(/(from\s+['"])(\.\.?\/[^'"?]+\.js)(['"])/g, `$1$2?v=${version}$3`);
  await writeFile(new URL(`src/${file}`, dist), content);
}
const html = (await readFile(new URL('index.html', dist), 'utf8'))
  .replace('./styles.css"', `./styles.css?v=${version}"`)
  .replace('./src/app.js"', `./src/app.js?v=${version}"`);
await writeFile(new URL('index.html', dist), html);
await writeFile(new URL('.nojekyll', dist), '');
console.log('Built static website in dist/');
