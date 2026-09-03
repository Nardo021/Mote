export type PairRequest = {
  id: string;
  device_id: string;
  device_name: string;
  created_at: number;
  expires_at: number;
};

export type PairApproval = {
  credential: string;
  device: {
    id: string;
    name: string;
    created_at: number;
  };
};
