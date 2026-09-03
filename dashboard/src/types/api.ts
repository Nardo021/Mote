export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type AdminUser = {
  id: string;
  username: string;
};

export type SessionResponse = {
  authenticated: boolean;
  configured?: boolean;
  user?: AdminUser;
};

export type RelayStatus = "operational" | "unavailable";
