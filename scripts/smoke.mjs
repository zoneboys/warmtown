// HTTP-only smoke test for the game and its companion website. No browser automation is used.
import { spawn } from 'node:child_process'
const port = 4400 + Math.floor(Math.random() * 700)
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  server.kill('SIGTERM')
}
async function requireResponse(path, contentType) {
  const response = await fetch(`${origin}${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  if (contentType && !response.headers.get('content-type')?.includes(contentType)) throw new Error(`${path}: expected ${contentType}, got ${response.headers.get('content-type')}`)
  return response
}
async function requireImage(path, contentType, validSignature) {
  const response = await requireResponse(new URL(path, `${origin}/`).pathname, contentType)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!validSignature(bytes)) throw new Error(`${path} has an invalid ${contentType} signature`)
}
const requirePng = path => requireImage(path, 'image/png', bytes => bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
const requireWebp = path => requireImage(path, 'image/webp', bytes => String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
try {
  let ready = false
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(origin)
      if (response.ok) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('preview server did not start')

  const gameHtml = await (await requireResponse('/', 'text/html')).text()
  if (!gameHtml.includes('暖湾小镇') || !gameHtml.includes('lang="zh-CN"')) throw new Error('Chinese game title or locale missing from HTML')
  const faviconUrl = gameHtml.match(/<link rel="icon"[^>]*href="([^"]+)"/)?.[1]
  const ogUrl = gameHtml.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
  const twitterUrl = gameHtml.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1]
  if (!faviconUrl || !ogUrl || !twitterUrl || ogUrl !== twitterUrl) throw new Error('game favicon or matching OG/Twitter image metadata is missing')
  await requirePng(faviconUrl)
  await requirePng(ogUrl)

  const floorplanHtml = await (await requireResponse('/floorplan-3d/index.html', 'text/html')).text()
  if (!floorplanHtml.includes('id="plan"') || !floorplanHtml.includes('id="applyGame"')) {
    throw new Error('embedded floorplan editor is missing its plan canvas or apply-to-game control')
  }

  const siteHtml = await (await requireResponse('/website/', 'text/html')).text()
  if (!siteHtml.includes('<html lang="zh-CN">') || !siteHtml.includes('<h1 id="hero-title">暖湾小镇</h1>') || !siteHtml.includes('在线多人') || !siteHtml.includes('本机')) {
    throw new Error('companion website is missing Chinese, meaningful page content, or accurate offline-scope copy')
  }
  const canonical = siteHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const siteOg = siteHtml.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
  const siteTwitter = siteHtml.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1]
  const heroUrl = siteHtml.match(/<img id="hero-art" src="([^"]+)"/)?.[1]
  if (!canonical?.endsWith('/website/') || !siteOg || siteOg !== siteTwitter || !heroUrl) throw new Error('website canonical, social preview, or hero asset reference is missing')
  await requireWebp(new URL(heroUrl, `${origin}/website/`).href)

  const manifest = await (await requireResponse('/manus-routes.json', 'application/json')).json()
  const paths = Array.isArray(manifest.routes) ? manifest.routes.map(route => route.path) : []
  if (paths.length !== 2 || !paths.includes('/') || !paths.includes('/website/')) throw new Error('route manifest does not declare both the game and companion site')
  const sitemap = await (await requireResponse('/sitemap.xml', 'xml')).text()
  if (!sitemap.includes('https://warmtown-fuhmwuyq.manus.game/website/')) throw new Error('sitemap does not declare the companion website')
  const robots = await (await requireResponse('/robots.txt', 'text/plain')).text()
  if (!robots.includes('Allow: /') || !robots.includes('/sitemap.xml')) throw new Error('robots document is missing public indexing policy or sitemap')

  console.log('smoke: OK — game root, embedded floorplan editor, companion page, route manifest, social art, sitemap, and robots respond over HTTP')
} catch (error) {
  console.error(`smoke: FAIL — ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  stop()
}
