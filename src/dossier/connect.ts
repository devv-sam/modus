import { connect } from "./auth.js";

const baseUrl = (process.env.DOSSIER_URL ?? "http://localhost:3000").replace(/\/+$/, "");

connect(baseUrl).catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
