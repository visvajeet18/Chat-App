-- 1. Create Profiles Table (Custom Simple Auth)
CREATE TABLE profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL, -- Custom plain text password for simple auth
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Create Messages Table
CREATE TABLE messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id text NOT NULL,
  sender text NOT NULL,
  text text,
  image text, -- Base64 String
  timestamp timestamp with time zone DEFAULT now()
);

-- Enable Realtime for Messages
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Enable Realtime publication for the table safely
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Set up Row Level Security (RLS) policies 
-- (Allowing anyone to read/write for this prototype setup)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow All Profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "Allow All Messages" ON messages FOR ALL USING (true);
