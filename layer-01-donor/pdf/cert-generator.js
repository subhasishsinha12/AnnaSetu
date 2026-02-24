/**
 * AnnaSetu — 80G PDF Certificate Generator
 * Uses PDFKit to produce a legally formatted donation certificate
 * under Section 80G of the Income Tax Act, 1961
 */

'use strict';

const PDFDocument = require('pdfkit');
const crypto      = require('crypto');
const path        = require('path');
const fs          = require('fs');
const { Pool }    = require('pg');

const LOGO_PATH     = path.join(__dirname, '../assets/annasetu-logo.png');
const SIGNATURE_PATH= path.join(__dirname, '../assets/signature.png');
const STAMP_PATH    = path.join(__dirname, '../assets/stamp.png');

// Colours
const GREEN_DARK  = '#1a6b3a';
const GREEN_LIGHT = '#e8f5e9';
const GOLD        = '#c9a84c';
const GREY_DARK   = '#2c3e50';
const GREY_MID    = '#7f8c8d';

/**
 * Generate an 80G certificate PDF and save to disk
 * @param {Object} certData - Certificate record joined with donor/lot data
 * @returns {Promise<{filePath:string, hash:string}>}
 */
async function generate80GCertificate(certData) {
  return new Promise((resolve, reject) => {
    const {
      certificate_number,
      donor_name,
      donor_legal_name,
      donor_pan,
      donor_address,
      donor_city,
      donor_state,
      donor_pincode,
      financial_year,
      total_value,
      deduction_amount,
      issued_at,
      valid_until,
      issuing_officer,
      issuing_org,
      ngo_reg_no,
      lots,                  // array of {lot_number, description, quantity, unit, expiry_date, estimated_value}
    } = certData;

    const outputDir  = process.env.CERT_OUTPUT_DIR || '/tmp/certificates';
    fs.mkdirSync(outputDir, { recursive: true });
    const filename   = `${certificate_number.replace(/\//g, '-')}.pdf`;
    const filePath   = path.join(outputDir, filename);
    const writeStream = fs.createWriteStream(filePath);

    // Accumulate bytes for hashing
    const hashBuf = [];

    const doc = new PDFDocument({
      size:   'A4',
      margin: 50,
      info: {
        Title:    `80G Certificate — ${certificate_number}`,
        Author:   issuing_org,
        Subject:  'Donation Certificate under Section 80G',
        Keywords: 'AnnaSetu, 80G, donation, food, India',
      },
    });

    doc.pipe(writeStream);
    doc.on('data', chunk => hashBuf.push(chunk));

    const W = doc.page.width;     // 595
    const MARGIN = 50;
    const CONTENT_W = W - MARGIN * 2;

    // ── Border ────────────────────────────────────────────────────────────────
    doc.rect(20, 20, W - 40, doc.page.height - 40)
       .lineWidth(3).strokeColor(GREEN_DARK).stroke();
    doc.rect(25, 25, W - 50, doc.page.height - 50)
       .lineWidth(1).strokeColor(GOLD).stroke();

    // ── Header band ───────────────────────────────────────────────────────────
    doc.rect(MARGIN, MARGIN, CONTENT_W, 80).fill(GREEN_DARK);

    // Logo (if exists, else placeholder)
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, MARGIN + 10, MARGIN + 10, { width: 60 });
    } else {
      doc.fontSize(28).fillColor(GOLD).text('🌾', MARGIN + 10, MARGIN + 20);
    }

    doc.fontSize(20).fillColor('white')
       .text('अन्न सेतु — AnnaSetu', MARGIN + 80, MARGIN + 15, { width: CONTENT_W - 90 })
       .fontSize(10).fillColor(GREEN_LIGHT)
       .text('India\'s Digital Food Bridge | IDBI Bank Initiative, Surat', MARGIN + 80, MARGIN + 42)
       .text('Certificate of Donation under Section 80G of Income Tax Act, 1961', MARGIN + 80, MARGIN + 57);

    // ── Certificate number badge ───────────────────────────────────────────────
    doc.rect(MARGIN, 140, CONTENT_W, 28).fill(GOLD);
    doc.fontSize(12).fillColor(GREY_DARK).font('Helvetica-Bold')
       .text(`Certificate No: ${certificate_number}`, MARGIN + 10, 148, { align: 'center', width: CONTENT_W - 20 });

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor(GREEN_DARK).font('Helvetica-Bold')
       .text('DONATION CERTIFICATE', MARGIN, 180, { align: 'center', width: CONTENT_W });

    // ── Certification text ────────────────────────────────────────────────────
    doc.fontSize(10).fillColor(GREY_DARK).font('Helvetica')
       .text(
         `This is to certify that the below-mentioned donor has made a voluntary food donation to AnnaSetu, ` +
         `operating under the aegis of IDBI Bank, Surat Branch, a registered entity under Section 12A and ` +
         `approved under Section 80G of the Income Tax Act, 1961 (Registration No: ${ngo_reg_no}).`,
         MARGIN, 210, { width: CONTENT_W, align: 'justify' }
       );

    // ── Donor details box ─────────────────────────────────────────────────────
    const boxY = 270;
    doc.rect(MARGIN, boxY, CONTENT_W, 90).fill(GREEN_LIGHT).stroke();
    doc.fontSize(11).fillColor(GREEN_DARK).font('Helvetica-Bold')
       .text('DONOR DETAILS', MARGIN + 10, boxY + 8);
    doc.fontSize(10).fillColor(GREY_DARK).font('Helvetica');

    const fields = [
      ['Full Name / Legal Name', `${donor_name} (${donor_legal_name})`],
      ['PAN',                    donor_pan],
      ['Address',                `${donor_address}, ${donor_city}, ${donor_state} — ${donor_pincode}`],
      ['Financial Year',         financial_year],
    ];
    let fieldY = boxY + 24;
    for (const [label, value] of fields) {
      doc.font('Helvetica-Bold').text(`${label}: `, MARGIN + 10, fieldY, { continued: true })
         .font('Helvetica').text(value);
      fieldY += 16;
    }

    // ── Donation summary ──────────────────────────────────────────────────────
    doc.fontSize(11).fillColor(GREEN_DARK).font('Helvetica-Bold')
       .text('DONATION DETAILS', MARGIN, 375);

    // Table header
    const tableX = MARGIN;
    const cols   = [130, 200, 80, 60, 80];   // widths
    const headers= ['Lot Number', 'Description', 'Qty', 'Unit', 'Value (₹)'];
    let tableY   = 392;

    doc.rect(tableX, tableY, CONTENT_W, 18).fill(GREEN_DARK);
    doc.fontSize(9).fillColor('white').font('Helvetica-Bold');
    let cx = tableX + 4;
    headers.forEach((h, i) => {
      doc.text(h, cx, tableY + 5, { width: cols[i] - 8 });
      cx += cols[i];
    });
    tableY += 18;

    // Table rows
    const displayLots = Array.isArray(lots) ? lots.slice(0, 12) : [];
    let altRow = false;
    for (const lot of displayLots) {
      if (altRow) doc.rect(tableX, tableY, CONTENT_W, 16).fill('#f0f7f0');
      doc.fontSize(8).fillColor(GREY_DARK).font('Helvetica');
      cx = tableX + 4;
      const rowData = [
        lot.lot_number,
        lot.description.substring(0, 35),
        String(lot.quantity),
        lot.unit,
        Number(lot.estimated_value).toLocaleString('en-IN'),
      ];
      rowData.forEach((d, i) => {
        doc.text(d, cx, tableY + 4, { width: cols[i] - 8 });
        cx += cols[i];
      });
      // row border
      doc.rect(tableX, tableY, CONTENT_W, 16).stroke();
      tableY += 16;
      altRow = !altRow;
    }

    // Total row
    doc.rect(tableX, tableY, CONTENT_W, 20).fill(GREEN_DARK);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
       .text(`Total Donation Value`, tableX + 4, tableY + 5, { width: cols[0] + cols[1] + cols[2] + cols[3] - 8 })
       .text(`₹${Number(total_value).toLocaleString('en-IN')}`, tableX + 4 + cols[0] + cols[1] + cols[2] + cols[3], tableY + 5, { width: cols[4] - 8 });
    tableY += 20;

    // Deduction note
    doc.rect(tableX, tableY, CONTENT_W, 18).fill(GOLD);
    doc.fontSize(9).fillColor(GREY_DARK).font('Helvetica-Bold')
       .text(
         `Eligible Deduction u/s 80G (50% of Total): ₹${Number(deduction_amount).toLocaleString('en-IN')}   |   Certificate Valid Until: ${valid_until || '31-Mar-' + financial_year.split('-')[1]}`,
         tableX + 10, tableY + 5, { width: CONTENT_W - 20 }
       );
    tableY += 18;

    // ── Declaration ───────────────────────────────────────────────────────────
    const declY = tableY + 16;
    doc.fontSize(9).fillColor(GREY_DARK).font('Helvetica')
       .text(
         'We hereby declare that the donation received is solely for food distribution to underprivileged beneficiaries under the National Food Security Act, ' +
         'through verified NGO partners and ONDC-enabled supply chain. No goods or services were provided to the donor in return for this donation. ' +
         'This certificate is eligible for deduction under Section 80G of the Income Tax Act, 1961.',
         MARGIN, declY, { width: CONTENT_W, align: 'justify' }
       );

    // ── Signatures ────────────────────────────────────────────────────────────
    const sigY = declY + 70;
    doc.moveTo(MARGIN, sigY).lineTo(MARGIN + 150, sigY).stroke();
    doc.moveTo(W - MARGIN - 150, sigY).lineTo(W - MARGIN, sigY).stroke();

    doc.fontSize(9).fillColor(GREY_DARK)
       .text(donor_name, MARGIN, sigY + 5, { width: 160 })
       .text('Donor Signature', MARGIN, sigY + 18, { width: 160 });

    doc.text(issuing_officer, W - MARGIN - 160, sigY + 5, { width: 160, align: 'right' })
       .text('Authorised Signatory', W - MARGIN - 160, sigY + 18, { width: 160, align: 'right' })
       .text(issuing_org, W - MARGIN - 160, sigY + 31, { width: 160, align: 'right', fontSize: 8 });

    if (fs.existsSync(SIGNATURE_PATH)) {
      doc.image(SIGNATURE_PATH, W - MARGIN - 120, sigY - 40, { width: 100 });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.rect(MARGIN, footerY, CONTENT_W, 1).fill(GOLD);
    doc.fontSize(8).fillColor(GREY_MID)
       .text(
         `Issued on: ${new Date(issued_at).toLocaleDateString('en-IN')} | ` +
         `Verification: https://annasetu.in/verify/${certificate_number} | ` +
         `IDBI Bank, Majura Gate Branch, Surat — 395001`,
         MARGIN, footerY + 6, { width: CONTENT_W, align: 'center' }
       );

    // ── QR verification code placeholder ─────────────────────────────────────
    doc.rect(W - MARGIN - 60, footerY - 60, 55, 55).stroke();
    doc.fontSize(6).fillColor(GREY_MID)
       .text('Scan to verify', W - MARGIN - 60, footerY - 10, { width: 55, align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      const hash = crypto.createHash('sha256')
        .update(Buffer.concat(hashBuf))
        .digest('hex');
      resolve({ filePath, hash, filename });
    });
    writeStream.on('error', reject);
  });
}

/**
 * Generate certificates for all verified donations in previous day
 * @param {Pool} db
 */
async function generateDailyCertificates(db) {
  const client = await db.connect();
  try {
    // Find donors with verified lots from yesterday with no certificate yet
    const result = await client.query(`
      SELECT d.*, 
             ARRAY_AGG(dl.id)              AS lot_ids,
             SUM(dl.estimated_value)       AS total_value,
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'lot_number',     dl.lot_number,
                 'description',    dl.description,
                 'quantity',       dl.quantity,
                 'unit',           dl.unit,
                 'estimated_value',dl.estimated_value,
                 'expiry_date',    dl.expiry_date
               )
             ) AS lots
      FROM   donation_lots dl
      JOIN   donors d ON dl.donor_id = d.id
      WHERE  dl.status = 'delivered'
        AND  dl.delivered_at >= NOW() - INTERVAL '24 hours'
        AND  dl.id NOT IN (
               SELECT UNNEST(c.lot_ids) FROM certificates c
             )
      GROUP BY d.id
    `);

    console.log(`[CERT CRON] Generating certificates for ${result.rowCount} donors`);
    const fy = getFinancialYear();

    for (const row of result.rows) {
      const certRecord = await client.query(`
        INSERT INTO certificates (donor_id, lot_ids, financial_year, total_value)
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [row.id, row.lot_ids, fy, row.total_value]
      );
      const cert = certRecord.rows[0];

      const pdfData = await generate80GCertificate({
        ...cert,
        donor_name:       row.name,
        donor_legal_name: row.legal_name,
        donor_pan:        row.pan,
        donor_address:    row.address_line1,
        donor_city:       row.city,
        donor_state:      row.state,
        donor_pincode:    row.pincode,
        lots:             row.lots,
        issuing_officer:  cert.issuing_officer,
        issuing_org:      cert.issuing_org,
        ngo_reg_no:       cert.ngo_reg_no,
      });

      const pdfUrl = `/certificates/${pdfData.filename}`;
      await client.query(
        `UPDATE certificates SET pdf_url = $1, pdf_hash = $2 WHERE id = $3`,
        [pdfUrl, pdfData.hash, cert.id]
      );
      console.log(`[CERT CRON] ✓ ${cert.certificate_number} → ${pdfData.filePath}`);
    }
  } finally {
    client.release();
  }
}

function getFinancialYear() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  return month >= 4
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
}

module.exports = { generate80GCertificate, generateDailyCertificates };
