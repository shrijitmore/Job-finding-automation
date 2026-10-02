// Serves a job feed on localhost so e2e runs never touch real job boards.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4557);
const now = new Date().toUTCString();
const item = (title, company, desc, link) => `<item><title>${company}: ${title}</title><region>Anywhere in the World</region><link>${link}</link><pubDate>${now}</pubDate><description>${desc}</description></item>`;
const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>E2E</title>
${item("Senior Backend Engineer", "Ledgerly", "Build TypeScript, Node.js, PostgreSQL and GraphQL services. Email jobs@ledgerly.io with your resume.", `http://localhost:${port}/jobs/ledgerly`)}
${item("Backend Engineer", "Payflow", "TypeScript, Node.js, Redis and PostgreSQL.", "https://job-boards.greenhouse.io/payflow/jobs/123")}
${item("Backend Developer", "Shopkit", "Node.js, PostgreSQL, GraphQL and React.", `http://localhost:${port}/jobs/shopkit`)}
${item("Account Executive", "Salesy", "Sell software.", `http://localhost:${port}/jobs/salesy`)}
</channel></rss>`;

createServer((req, res) => {
  if (req.url === "/feed.rss") return res.writeHead(200, { "content-type": "application/rss+xml" }).end(feed);
  res.writeHead(404).end("not found");
}).listen(port, "127.0.0.1");
