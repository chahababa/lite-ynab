-- Administrative fixture maintenance only; no application EXECUTE grant.
-- Fixed now parameter supplied by synthetic harness via psql variable.
UPDATE synthetic.candidates SET status='expired',version=version+1,
 closed_at=created_at+interval '30 days',amount=NULL,detail=NULL,scrubbed_at=:'now'::timestamptz
 WHERE status IN ('pending','conflict') AND created_at+interval '30 days' <= :'now'::timestamptz;
-- Expiry clears immediately, including legacy expired shells, never expiry+7 days.
UPDATE synthetic.candidates SET amount=NULL,detail=NULL,scrubbed_at=:'now'::timestamptz
 WHERE status='expired' AND scrubbed_at IS NULL;
UPDATE synthetic.candidates SET amount=NULL,detail=NULL,scrubbed_at=:'now'::timestamptz
 WHERE status IN ('imported','linked','ignored','excluded')
 AND closed_at+interval '7 days' <= :'now'::timestamptz AND scrubbed_at IS NULL;
DELETE FROM synthetic.events WHERE candidate_id IN
 (SELECT id FROM synthetic.candidates WHERE closed_at+interval '90 days' <= :'now'::timestamptz);
DELETE FROM synthetic.candidates WHERE closed_at+interval '90 days' <= :'now'::timestamptz;
