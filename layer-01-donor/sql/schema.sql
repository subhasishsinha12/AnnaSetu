-- =============================================================================
-- AnnaSetu Layer 01 — Donor Database Schema
-- PostgreSQL 15+
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- for geo queries

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE donor_type       AS ENUM ('supermarket','restaurant','farm','warehouse','individual');
CREATE TYPE donation_status  AS ENUM ('pending','verified','dispatched','delivered','expired','cancelled');
CREATE TYPE food_category    AS ENUM ('grains','vegetables','fruits','dairy','cooked','packaged','oil','spices','other');
CREATE TYPE unit_type        AS ENUM ('kg','litre','units','boxes','packets');
CREATE TYPE certificate_type AS ENUM ('80G','CSR','acknowledgement');

-- ── Donors ────────────────────────────────────────────────────────────────────

CREATE TABLE donors (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  name              TEXT          NOT NULL,
  legal_name        TEXT          NOT NULL,
  type              donor_type    NOT NULL,
  pan               CHAR(10)      UNIQUE NOT NULL,           -- for 80G
  gstin             CHAR(15),
  email             TEXT          NOT NULL,
  phone             VARCHAR(15)   NOT NULL,
  address_line1     TEXT          NOT NULL,
  address_line2     TEXT,
  city              TEXT          NOT NULL DEFAULT 'Surat',
  state             TEXT          NOT NULL DEFAULT 'Gujarat',
  pincode           CHAR(6)       NOT NULL,
  location          GEOGRAPHY(POINT,4326),                   -- PostGIS
  pos_system        TEXT,                                    -- 'DMART','RELIANCE','CUSTOM'
  pos_webhook_secret TEXT,
  ondc_seller_id    TEXT,
  bank_account_no   TEXT,
  bank_ifsc         CHAR(11),
  is_active         BOOLEAN       DEFAULT TRUE,
  kyc_verified      BOOLEAN       DEFAULT FALSE,
  kyc_verified_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_donors_location    ON donors USING GIST(location);
CREATE INDEX idx_donors_pan         ON donors(pan);
CREATE INDEX idx_donors_type        ON donors(type);

-- ── Donation Lots ─────────────────────────────────────────────────────────────

CREATE TABLE donation_lots (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  donor_id          UUID          NOT NULL REFERENCES donors(id),
  lot_number        TEXT          GENERATED ALWAYS AS ('LOT-' || TO_CHAR(created_at,'YYYYMMDD') || '-' || SUBSTRING(id::TEXT,1,6)) STORED,
  category          food_category NOT NULL,
  description       TEXT          NOT NULL,
  quantity          NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit              unit_type     NOT NULL,
  weight_kg         NUMERIC(10,2),                           -- normalized weight
  estimated_value   NUMERIC(12,2) NOT NULL,                  -- INR for 80G
  manufacture_date  DATE,
  expiry_date       DATE          NOT NULL,
  storage_temp_min  NUMERIC(5,2),                            -- Celsius
  storage_temp_max  NUMERIC(5,2),
  allergens         TEXT[],
  is_vegetarian     BOOLEAN       DEFAULT TRUE,
  is_organic        BOOLEAN       DEFAULT FALSE,
  fssai_license     TEXT,
  pickup_address    TEXT,
  pickup_location   GEOGRAPHY(POINT,4326),
  pickup_available_from TIMESTAMPTZ,
  pickup_available_to   TIMESTAMPTZ,
  status            donation_status DEFAULT 'pending',
  blockchain_lot_id TEXT,                                    -- Hyperledger asset ID
  ondc_item_id      TEXT,
  ngo_id            UUID,                                    -- assigned NGO
  qr_code_url       TEXT,
  photos            TEXT[],
  pos_transaction_id TEXT,
  pos_store_id      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),
  verified_at       TIMESTAMPTZ,
  dispatched_at     TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  expired_notified  BOOLEAN       DEFAULT FALSE
);

CREATE INDEX idx_lots_donor         ON donation_lots(donor_id);
CREATE INDEX idx_lots_status        ON donation_lots(status);
CREATE INDEX idx_lots_expiry        ON donation_lots(expiry_date);
CREATE INDEX idx_lots_category      ON donation_lots(category);
CREATE INDEX idx_lots_pickup_loc    ON donation_lots USING GIST(pickup_location);
CREATE INDEX idx_lots_created       ON donation_lots(created_at DESC);

-- ── Expiry Alerts ─────────────────────────────────────────────────────────────

CREATE TABLE expiry_alerts (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  lot_id            UUID          NOT NULL REFERENCES donation_lots(id),
  alert_type        TEXT          NOT NULL,                  -- '48h','24h','expired'
  sent_at           TIMESTAMPTZ   DEFAULT NOW(),
  channel           TEXT          NOT NULL,                  -- 'email','sms','webhook'
  recipient         TEXT,
  status            TEXT          DEFAULT 'sent',
  response          JSONB
);

-- ── 80G Certificates ──────────────────────────────────────────────────────────

CREATE TABLE certificates (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  certificate_number TEXT         GENERATED ALWAYS AS ('ANNA-80G-' || TO_CHAR(issued_at,'YYYY') || '-' || LPAD(serial_no::TEXT, 6, '0')) STORED,
  serial_no         SERIAL,
  donor_id          UUID          NOT NULL REFERENCES donors(id),
  lot_ids           UUID[]        NOT NULL,
  type              certificate_type DEFAULT '80G',
  financial_year    TEXT          NOT NULL,                  -- '2025-26'
  total_value       NUMERIC(14,2) NOT NULL,
  deduction_amount  NUMERIC(14,2) GENERATED ALWAYS AS (total_value * 0.5) STORED,  -- 50% deduction under 80G
  issued_at         TIMESTAMPTZ   DEFAULT NOW(),
  valid_until       DATE,
  pdf_url           TEXT,
  pdf_hash          TEXT,                                    -- SHA-256 for verification
  issuing_officer   TEXT          DEFAULT 'Subhasish Sinha, AGM',
  issuing_org       TEXT          DEFAULT 'AnnaSetu Initiative — IDBI Bank, Surat',
  ngo_reg_no        TEXT          DEFAULT '12A/80G/GUJARAT/2024',
  is_revoked        BOOLEAN       DEFAULT FALSE
);

CREATE INDEX idx_certs_donor        ON certificates(donor_id);
CREATE INDEX idx_certs_fy           ON certificates(financial_year);

-- ── POS Webhook Logs ──────────────────────────────────────────────────────────

CREATE TABLE pos_webhook_logs (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  source            TEXT          NOT NULL,                  -- 'DMART','RELIANCE','BIGBASKET'
  store_id          TEXT,
  payload           JSONB         NOT NULL,
  signature         TEXT,
  verified          BOOLEAN       DEFAULT FALSE,
  processed         BOOLEAN       DEFAULT FALSE,
  lot_id_created    UUID,
  error             TEXT,
  received_at       TIMESTAMPTZ   DEFAULT NOW()
);

-- ── NGO Registry (referenced from L01) ───────────────────────────────────────

CREATE TABLE ngos (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  name              TEXT          NOT NULL,
  reg_no            TEXT          UNIQUE NOT NULL,
  email             TEXT          NOT NULL,
  phone             VARCHAR(15),
  address           TEXT,
  location          GEOGRAPHY(POINT,4326),
  city              TEXT          DEFAULT 'Surat',
  state             TEXT          DEFAULT 'Gujarat',
  pincode           CHAR(6),
  capacity_kg_day   NUMERIC(8,2),                           -- storage capacity
  current_load_kg   NUMERIC(8,2)  DEFAULT 0,
  vehicle_available BOOLEAN       DEFAULT FALSE,
  cold_storage      BOOLEAN       DEFAULT FALSE,
  is_active         BOOLEAN       DEFAULT TRUE,
  ondc_buyer_id     TEXT,
  created_at        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_ngos_location ON ngos USING GIST(location);

-- ── Triggers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donors_updated_at    BEFORE UPDATE ON donors        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER lots_updated_at      BEFORE UPDATE ON donation_lots  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seed: Sample Gujarat NGOs ─────────────────────────────────────────────────

INSERT INTO ngos (name, reg_no, email, phone, address, city, pincode, capacity_kg_day, vehicle_available, cold_storage) VALUES
  ('Robin Hood Army Surat',   'RHA-GJ-001', 'surat@robinhoodarmy.com', '9876543210', 'Ring Road, Surat', 'Surat', '395007', 500, TRUE,  FALSE),
  ('Roti Bank Surat',         'RB-GJ-002',  'info@rotibanksurat.org',  '9876543211', 'Adajan, Surat',    'Surat', '395009', 300, TRUE,  FALSE),
  ('Annamrita Foundation',    'AF-GJ-003',  'surat@annamrita.org',     '9876543212', 'Udhna, Surat',     'Surat', '394210', 800, TRUE,  TRUE),
  ('Iskcon Food Relief',      'ISKCON-GJ',  'foodrelief@iskcon.in',    '9876543213', 'Citylight, Surat', 'Surat', '395007', 400, FALSE, TRUE),
  ('Akshay Patra Foundation', 'APF-GJ-004', 'surat@akshayapatra.org',  '9876543214', 'Vesu, Surat',      'Surat', '395007', 1000,TRUE,  TRUE);
