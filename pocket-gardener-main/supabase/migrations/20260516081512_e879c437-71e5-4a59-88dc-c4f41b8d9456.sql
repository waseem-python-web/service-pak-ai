-- Conversations + messages for AI chat history
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_updated ON public.conversations (user_id, updated_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conversations select" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own conversations insert" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own conversations update" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own conversations delete" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.conversation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  providers JSONB,
  service_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_messages_conv ON public.conversation_messages (conversation_id, created_at);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conv messages select" ON public.conversation_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own conv messages insert" ON public.conversation_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own conv messages delete" ON public.conversation_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Bump conversation.updated_at whenever messages are added
CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_conversation
AFTER INSERT ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_updated_at();