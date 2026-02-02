import { api } from "./api";

export const getPackages = () => {
  return api.get("/api/packages");
};

export const getPackagesFull = () => {
  return api.get("/api/packages/full");
};
