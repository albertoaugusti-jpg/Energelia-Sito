-- Durable Resend retry metadata on the existing enquiry, no separate queue.
ALTER TABLE digital_project_requests
    ADD COLUMN IF NOT EXISTS notification_key VARCHAR(80),
    ADD COLUMN IF NOT EXISTS notification_payload JSONB,
    ADD COLUMN IF NOT EXISTS notification_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notification_first_attempt_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notification_next_attempt_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notification_provider_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS notification_error VARCHAR(64);
CREATE INDEX IF NOT EXISTS digital_requests_notification_due
ON digital_project_requests(notification_next_attempt_at, id)
WHERE notification_status IN ('in-attesa', 'fallita', 'non-configurata');
