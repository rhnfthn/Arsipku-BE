/** Printed in the page margin before signing; signed PDFs must never be edited. */
export function tteFooterPdfOptions(enabled?: boolean) {
  if (!enabled) return {};
  return {
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;box-sizing:border-box;padding:0 20mm 3mm 25mm;text-align:center;font-family:'Times New Roman',Times,serif;font-size:9px;line-height:1.3;color:#000;">
      Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik<br>
      yang diterbitkan oleh Balai Besar Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara
    </div>`,
  };
}
