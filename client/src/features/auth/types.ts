export type LoginResponse = {
  user_id: string;
  token: string;
  expires_at: number;
};

export type AuthSession = {
  userId: string;
  token: string;
  expiresAt: number;
};
