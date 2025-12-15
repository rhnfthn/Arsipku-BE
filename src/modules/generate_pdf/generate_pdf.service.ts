import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class GeneratePdfService {
  async generatePdf(body: any): Promise<Buffer> {
    const buffer = Buffer.from(body.html, "base64");
    const decodedContent = decodeURIComponent(escape(buffer.toString('utf-8')));
    const html = decodedContent;
    const perihal = body.perihal || "";
    const dari = body.dari || "Direktur Teknik";
    const tanggal = body.tanggal || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const penandatangan = body.penandatangan || "Zainal Arifin Harahap";
    const penerima = body.penerima;
    let penerimaHtml = "";
    if(penerima.length>1){
        penerimaHtml = "<ol style='margin-top:0px;margin-left:-20px;margin-bottom:0px;'>";
        penerima.forEach((item) => {
            penerimaHtml += `<li>${item}</li>`;
        });
        penerimaHtml += "</ol>";
    } else {
        penerimaHtml = penerima[0] || "";
    }
    const tembusandata = body.tembusan;
    
    let tembusanHtml = "";
    if(tembusandata.length>1){
        tembusanHtml = "<ol style='margin-top:0px;margin-left:-20px;'>";
        tembusandata.forEach((item) => {
            tembusanHtml += `<li>${item}</li>`;
        });
        tembusanHtml += "</ol>";
    } else {
        tembusanHtml = tembusandata[0] || "";
    }
    // console.log(tembusanHtml);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td width='10%'><img src='http://localhost/echain-app/includes/images/logo_airnav.jpg' width='75'></td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:13px;vertical-align:bottom!important;'>
              
              <span style='font-size:10px;line-height:11px;'>
                Kantor Pusat Perum LPPNPI
                Gedung AirNav Indonesia<br>
                Jl. Ir. H. Juanda No. 1 Tangerang<br>
                Banten 15121 Indonesia<br>
                Telp : 021-55915000<br>
                www.airnavindonesia.co.id
              </span>
            </td>
          </tr>
          <tr>
            <td colspan='3' style='font-size:2px;'>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    `;

    const header2 = `<table style="margin:auto;">
        <tbody><tr>
            <td align="center" style="padding-top:20px;">
            <b style="font-size:18px;"><u>N O T A &nbsp; D I N A S</u></b>
            <br>
            Nomor :     </td>
        </tr>
        </tbody></table>`;
    const header3 = `<table style="margin:0 auto;width:65%;">
        <tbody><tr>
            <td width="120" style="width:30%;vertical-align:top;">Kepada Yth.</td>
            <td style="width:5%;text-align:center;vertical-align:top;">:</td>
            <td style="vertical-align:top;">${penerimaHtml}</td>
        </tr>
        <tr>
            <td style="vertical-align:top;">Dari</td><td style="vertical-align:top;width:10px;text-align:center;">:</td><td style="vertical-align:top;">${dari}</td>
        </tr>
        <tr>
            <td style="vertical-align:top;">Perihal</td><td style="vertical-align:top;width:10px;text-align:center;">:</td><td style="vertical-align:top;text-align:justify;">${perihal}</td>
        </tr>
        
        </tbody></table>`;

    const ttd = `<table style="margin:auto;width:90%;">
        <tbody><tr>
            <td style="width:50%;">
            </td>
            <td style="text-align:center;">
            ${tanggal}<br>
            ${dari}<br>  
                    <br>
                    <br>
                    <br>${penandatangan}    </td>
        </tr>
        </tbody></table>`;

    let tembusanKonten = "";
    if(tembusanHtml!=''){
    tembusanKonten = `<table style="margin:20px auto;width:100%;">
        <tbody><tr>
            <td>&nbsp;</td>
        </tr>
        <tr>
            <td>
            Tembusan Yth:<br>${tembusanHtml}</td>
        </tr>
        </tbody></table>`;
    } else {
        tembusanKonten = "";
    }

    const konten = header + header2 + header3 + html + ttd + tembusanKonten;

    const page = await browser.newPage();
    await page.setContent(konten, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        bottom: '15mm',
        left: '15mm',
        right: '15mm',
      },
    });

    await browser.close();

    return Buffer.from(pdf);
  }
}
