import { readFile, writeFile } from 'node:fs/promises'

const output = new URL('../dist/', import.meta.url)
const hostedOrigin = 'https://zoneboys.github.io/warmtown'
const oldOrigin = 'https://warmtown-fuhmwuyq.manus.game'

for (const path of ['index.html', 'website/index.html', 'sitemap.xml', 'robots.txt']) {
  const file = new URL(path, output)
  let contents = await readFile(file, 'utf8')
  contents = contents.replaceAll(oldOrigin, hostedOrigin)
  await writeFile(file, contents)
}

console.log(`Prepared GitHub Pages metadata for ${hostedOrigin}`)
