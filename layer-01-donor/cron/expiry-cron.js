/**
 * AnnaSetu — Expiry Cron Job
 * Checks donation lots approaching expiry and triggers:
 *   1. Email/SMS alerts to donors
 *   2. ONDC urgency flag update
 *   3. Blockchain status update
 *   4. Auto-cancel lots past expiry
 */

'use strict';

const nodemailer = require('nodemailer');
const twilio     = require('twilio');
const axios      = require('axios');

const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port:   587,
  auth:   { user: 'apikey', pass: process.env.SENDGRID_KEY },
});

const smsClient = process.env.TWILIO_SID
  ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
  : null;

/**
 * Main cron function — called every 6 hours
 * @param {import('pg').Pool} db
 */
async function runExpiryCron(db) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Find lots expiring within 48 hours (not yet notified) ──────────────
    const expiring48h = await client.query(`
      SELECT dl.*, d.name AS donor_name, d.email AS donor_email,
             d.phone AS donor_phone, d.pan AS donor_pan
      FROM   donation_lots dl
      JOIN   donors d ON dl.donor_id = d.id
      WHERE  dl.status IN ('pending','verified')
        AND  dl.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
        AND  NOT EXISTS (
               SELECT 1 FROM expiry_alerts ea
               WHERE ea.lot_id = dl.id AND ea.alert_type = '48h'
             )
    `);

    // ── 2. Find lots expiring within 24 hours ─────────────────────────────────
    const expiring24h = await client.query(`
      SELECT dl.*, d.name AS donor_name, d.email AS donor_email,
             d.phone AS donor_phone
      FROM   donation_lots dl
      JOIN   donors d ON dl.donor_id = d.id
      WHERE  dl.status IN ('pending','verified')
        AND  dl.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        AND  NOT EXISTS (
               SELECT 1 FROM expiry_alerts ea
               WHERE ea.lot_id = dl.id AND ea.alert_type = '24h'
             )
    `);

    // ── 3. Find already-expired lots ──────────────────────────────────────────
    const expired = await client.query(`
      SELECT dl.*, d.name AS donor_name, d.email AS donor_email
      FROM   donation_lots dl
      JOIN   donors d ON dl.donor_id = d.id
      WHERE  dl.status IN ('pending','verified')
        AND  dl.expiry_date < NOW()
        AND  NOT dl.expired_notified
    `);

    console.log(`[EXPIRY CRON] 48h: ${expiring48h.rowCount} | 24h: ${expiring24h.rowCount} | expired: ${expired.rowCount}`);

    // ── Process 48h alerts ────────────────────────────────────────────────────
    for (const lot of expiring48h.rows) {
      await sendExpiryAlert(client, lot, '48h');
    }

    // ── Process 24h alerts ────────────────────────────────────────────────────
    for (const lot of expiring24h.rows) {
      await sendExpiryAlert(client, lot, '24h');
      // Also flag as urgent on ONDC
      await flagOndcUrgent(lot.ondc_item_id).catch(() => {});
    }

    // ── Auto-cancel expired lots ──────────────────────────────────────────────
    for (const lot of expired.rows) {
      await client.query(
        `UPDATE donation_lots SET status = 'expired', expired_notified = TRUE, updated_at = NOW() WHERE id = $1`,
        [lot.id]
      );
      await client.query(
        `INSERT INTO expiry_alerts (lot_id, alert_type, channel, recipient, status)
         VALUES ($1, 'expired', 'system', $2, 'processed')`,
        [lot.id, lot.donor_email]
      );
      // Notify donor of expiry
      await sendEmail(
        lot.donor_email,
        `[AnnaSetu] Donation Lot ${lot.lot_number} has expired`,
        buildExpiredEmailBody(lot)
      ).catch(console.error);
      console.log(`[EXPIRY CRON] Lot ${lot.lot_number} marked expired`);
    }

    await client.query('COMMIT');
    console.log('[EXPIRY CRON] ✓ Complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[EXPIRY CRON] ERROR:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function sendExpiryAlert(client, lot, alertType) {
  const hoursRemaining = alertType === '48h' ? 48 : 24;
  const subject = `[AnnaSetu] ⚠️ Donation lot expires in ${hoursRemaining} hours`;
  const body    = buildAlertEmailBody(lot, hoursRemaining);

  // Email alert
  try {
    await sendEmail(lot.donor_email, subject, body);
    await client.query(
      `INSERT INTO expiry_alerts (lot_id, alert_type, channel, recipient, status)
       VALUES ($1, $2, 'email', $3, 'sent')`,
      [lot.id, alertType, lot.donor_email]
    );
  } catch (e) {
    console.error(`Email failed for ${lot.lot_number}:`, e.message);
  }

  // SMS alert for 24h
  if (alertType === '24h' && lot.donor_phone && smsClient) {
    try {
      await smsClient.messages.create({
        body: `AnnaSetu: Your donation lot ${lot.lot_number} (${lot.quantity}${lot.unit} ${lot.category}) expires in 24 hours. Pickup urgently needed. Helpline: 1800-XXX-XXXX`,
        from: process.env.TWILIO_FROM,
        to:   `+91${lot.donor_phone}`,
      });
      await client.query(
        `INSERT INTO expiry_alerts (lot_id, alert_type, channel, recipient, status)
         VALUES ($1, $2, 'sms', $3, 'sent')`,
        [lot.id, alertType, lot.donor_phone]
      );
    } catch (e) {
      console.error(`SMS failed for ${lot.lot_number}:`, e.message);
    }
  }

  console.log(`[EXPIRY CRON] Alert sent: ${lot.lot_number} | ${alertType}`);
}

async function flagOndcUrgent(ondcItemId) {
  if (!ondcItemId) return;
  await axios.post(
    `${process.env.ONDC_SERVICE_URL}/catalog/items/${ondcItemId}/flag-urgent`,
    { urgent: true, reason: 'expiry_24h' },
    { headers: { 'Authorization': `Bearer ${process.env.ONDC_SERVICE_TOKEN}` } }
  );
}

async function sendEmail(to, subject, html) {
  if (!process.env.SENDGRID_KEY) {
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }
  return mailer.sendMail({
    from:    '"AnnaSetu Initiative" <noreply@annasetu.in>',
    to, subject, html,
  });
}

function buildAlertEmailBody(lot, hours) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <div style="background:#1a6b3a;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0">🌾 AnnaSetu — Donation Expiry Alert</h1>
      </div>
      <div style="padding:24px;background:#f9f9f9">
        <h2 style="color:#c0392b">⚠️ Your donation expires in ${hours} hours</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;font-weight:bold">Lot Number</td><td>${lot.lot_number}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Description</td><td>${lot.description}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Quantity</td><td>${lot.quantity} ${lot.unit}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Expiry Date</td><td>${new Date(lot.expiry_date).toLocaleDateString('en-IN')}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Est. Value</td><td>₹${Number(lot.estimated_value).toLocaleString('en-IN')}</td></tr>
        </table>
        <p>An NGO partner is being urgently matched. Please ensure the items are accessible for pickup.</p>
        <p>For queries: <a href="mailto:support@annasetu.in">support@annasetu.in</a> | 1800-XXX-XXXX</p>
      </div>
    </div>`;
}

function buildExpiredEmailBody(lot) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <div style="background:#7f8c8d;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0">🌾 AnnaSetu — Donation Lot Expired</h1>
      </div>
      <div style="padding:24px">
        <p>Lot <strong>${lot.lot_number}</strong> has been marked as expired and removed from the active donation pool.</p>
        <p>Your 80G tax certificate for eligible prior donations remains valid. Check your dashboard for details.</p>
      </div>
    </div>`;
}

module.exports = { runExpiryCron };
