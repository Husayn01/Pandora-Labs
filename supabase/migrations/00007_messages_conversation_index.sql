-- Cover the messages -> conversations foreign key used by both RLS and chat history reads.
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
