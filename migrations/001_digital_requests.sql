-- Additive, repeatable PostgreSQL migration. Existing message/service remain intact.
-- Run by init_db in the same transaction as the existing site schema.
SELECT pg_advisory_xact_lock(72481001);
CREATE TABLE IF NOT EXISTS digital_project_requests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(40),
    service VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    contact_ack_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE digital_project_requests
    ADD COLUMN IF NOT EXISTS category VARCHAR(32),
    ADD COLUMN IF NOT EXISTS goals JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS project_context TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS existing_solution TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS timeline VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'nuova',
    ADD COLUMN IF NOT EXISTS outcome VARCHAR(32) NOT NULL DEFAULT 'da-valutare',
    ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(254),
    ADD COLUMN IF NOT EXISTS notification_status VARCHAR(32) NOT NULL DEFAULT 'storica',
    ADD COLUMN IF NOT EXISTS notification_updated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(32),
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80),
    ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
-- Only explicit legacy labels are classified. Ambiguous records stay identifiable.
UPDATE digital_project_requests SET category = CASE
    WHEN service = 'gestionale' AND message LIKE 'Interesse indicato: App e software su misura%' THEN 'app-software'
    WHEN service = 'gestionale' AND message LIKE 'Interesse indicato: Gestionali su misura%' THEN 'gestionale'
    WHEN service = 'gestionale' THEN 'legacy-gestionale'
    WHEN service IN ('sito','app-software','automazioni','da-definire') THEN service
    ELSE 'legacy-altro' END
WHERE category IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS digital_requests_idempotency ON digital_project_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS digital_requests_created ON digital_project_requests(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS digital_requests_filters ON digital_project_requests(category, status);
CREATE INDEX IF NOT EXISTS digital_requests_payload ON digital_project_requests(payload_hash, created_at);
CREATE INDEX IF NOT EXISTS digital_requests_ip ON digital_project_requests(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS digital_requests_email_rate ON digital_project_requests(LOWER(email), created_at);
-- Old workers/integrations may still insert the original five fields during a
-- rolling release. Classify those writes without rewriting their original data.
CREATE OR REPLACE FUNCTION digital_request_legacy_category() RETURNS trigger AS $$
BEGIN
    IF NEW.category IS NULL THEN
        NEW.category := CASE
            WHEN NEW.service = 'gestionale' AND NEW.message LIKE 'Interesse indicato: App e software su misura%' THEN 'app-software'
            WHEN NEW.service = 'gestionale' AND NEW.message LIKE 'Interesse indicato: Gestionali su misura%' THEN 'gestionale'
            WHEN NEW.service = 'gestionale' THEN 'legacy-gestionale'
            WHEN NEW.service IN ('sito','app-software','automazioni','da-definire') THEN NEW.service
            ELSE 'legacy-altro' END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS digital_request_legacy_category_trigger ON digital_project_requests;
CREATE TRIGGER digital_request_legacy_category_trigger BEFORE INSERT ON digital_project_requests
FOR EACH ROW EXECUTE FUNCTION digital_request_legacy_category();
