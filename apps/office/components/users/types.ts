export interface BackendUser {
  id: string;
  name: string | null;
  email: string;
  tier: "free" | "pro";
  image: string | null;
  emailVerified: string | null;
  planSelectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
