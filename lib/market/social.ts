export type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
};
export type Conversation = {
  id: string;
  updated_at: string;
  peer: Member;
  unread: number;
  blocked_by_me: boolean;
  blocked_by_peer: boolean;
  latest: {
    body: string;
    image: boolean;
    deleted: boolean;
    sender_id: string;
    created_at: string;
  } | null;
};
export type ChatMessage = {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  image_url?: string | null;
  reactions: { user_id: string; emoji: string }[];
};
export type MarketNotification = {
  id: string;
  kind: string;
  title: string;
  href: string;
  amount_cents: number | null;
  created_at: string;
  read_at: string | null;
};
