import PQueue from 'p-queue';

const configuredConcurrency = Number(process.env.PDF_RENDER_CONCURRENCY || 5);
const pdfRenderConcurrency =
  Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.floor(configuredConcurrency)
    : 5;

export const pdfQueue = new PQueue({
  // SDE Massal umumnya berisi lima naskah. Lima halaman Puppeteer dapat
  // dirender bersamaan agar finalisasi tidak antre dalam tiga gelombang.
  concurrency: pdfRenderConcurrency,
  intervalCap: 10, // ⬅️ optional: max 10 job
  interval: 1000, // ⬅️ per 1 detik
  throwOnTimeout: true, // ⬅️ penting: jangan resolve undefined saat timeout
});
