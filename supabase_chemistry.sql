-- Chemistry / Kenalan: mutual consent to reveal identity in 1:1 rooms.
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS room_reveal_consents (
  room_id bigint NOT NULL,
  user_id bigint NOT NULL,
  created_at timestamptz,
  PRIMARY KEY (room_id, user_id)
);

-- Optional: FK to rooms if you want referential integrity
-- ALTER TABLE room_reveal_consents ADD CONSTRAINT fk_room
--   FOREIGN KEY (room_id) REFERENCES rooms(id);
