import { api } from "./api";

export const getPackages = () => {
  return api.get("/api/packages");
};
