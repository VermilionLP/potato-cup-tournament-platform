-- Custom vote topics (服务器 / 地图 … options players proposed during the
-- time vote) were removed from the site; drop their votes.
DROP TABLE IF EXISTS axsuck.custom_votes;
