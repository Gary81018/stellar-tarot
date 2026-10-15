import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'src', 'assets']) {
  await cp(new URL(file, root), new URL(file, dist), { recursive: true });
}
await writeFile(new URL('.nojekyll', dist), '');
console.log('Built static website in dist/');
