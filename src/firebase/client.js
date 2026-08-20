import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./config.js";

const app = getApps().some((item) => item.name === "[DEFAULT]")
  ? getApp()
  : initializeApp(firebaseConfig);

const creatorApp = getApps().some((item) => item.name === "user-creator")
  ? getApp("user-creator")
  : initializeApp(firebaseConfig, "user-creator");

export const auth = getAuth(app);
export const creatorAuth = getAuth(creatorApp);
export const firestore = getFirestore(app);
export { app };
