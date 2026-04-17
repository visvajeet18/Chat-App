-- 1. Create Profiles Table (Custom Simple Auth)
CREATE TABLE profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL, -- Custom plain text password for simple auth
  avatar_url text, -- For storing profile photo paths
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Create Messages Table
CREATE TABLE messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id text NOT NULL,
  sender text NOT NULL,
  text text,
  image text, -- Kept for legacy base64 if needed, but we recommend using file_url
  file_url text, -- Supabase Storage URL for attachments (image/video/doc)
  file_type text, -- Mime type: 'image', 'video', 'document', etc.
  is_read boolean DEFAULT false, -- Read Status Tick
  parent_id uuid REFERENCES messages(id) ON DELETE SET NULL, -- For message replies
  reactions jsonb DEFAULT '[]'::jsonb, -- Array of objects like {emoji: '🚀', users: ['alice']}
  is_edited boolean DEFAULT false,
  last_edited_at timestamp with time zone,
  timestamp timestamp with time zone DEFAULT now()
);

-- 3. Storage Setup (Important Instructions for User)
-- Please go to your Supabase Dashboard -> Storage -> Create two public buckets: 
-- 1. "user-avatars"
-- 2. "chat-attachments"
-- Enable public policies for insert/select on these buckets.

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
