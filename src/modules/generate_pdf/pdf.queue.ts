import PQueue from 'p-queue';

export const pdfQueue = new PQueue({
  concurrency: 2, // ⬅️ MAKS 2 PDF render bersamaan
  intervalCap: 10, // ⬅️ optional: max 10 job
  interval: 1000, // ⬅️ per 1 detik
  throwOnTimeout: true, // ⬅️ penting: jangan resolve undefined saat timeout
});
