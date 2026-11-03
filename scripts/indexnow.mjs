// Announces every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver…).
// Run once the site is public on its domain, and after publishing listings:
//   node scripts/indexnow.mjs
// The key is public by design: it is served at /bc6dd52b8014b97d3deeb96bea5d241f.txt.
const KEY = "bc6dd52b8014b97d3deeb96bea5d241f";
const host = new URL(process.env.SITE_URL || "https://marketpaperclip.com").host;
const sitemap = await fetch(`https://${host}/sitemap.xml`);
if (!sitemap.ok) throw new Error(`Sitemap unavailable (HTTP ${sitemap.status}). Is the site public?`);
const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(/&amp;/g, "&"))
  .slice(0, 10000);
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${urls.length} URLs submitted, HTTP ${response.status}`);
if (![200, 202].includes(response.status)) process.exitCode = 1;
