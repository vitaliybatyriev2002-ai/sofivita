CREATE TABLE IF NOT EXISTS quarrels (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL CHECK (count >= 0 AND count <= 9007199254740991)
);
INSERT OR IGNORE INTO quarrels (id, count) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS quarrel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delta INTEGER NOT NULL,
  count_after INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS log_quarrel_change
AFTER UPDATE OF count ON quarrels
WHEN NEW.count != OLD.count
BEGIN
  INSERT INTO quarrel_events (delta, count_after, created_at)
  VALUES (NEW.count - OLD.count, NEW.count, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
