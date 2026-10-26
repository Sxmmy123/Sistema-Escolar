import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";
import { firebaseConfig } from "./config.js";

const name = "recuperacion-publica";
const existing = getApps().some((app) => app.name === name);
const app = existing ? getApp(name) : initializeApp(firebaseConfig, name);
export const authRecuperacion = existing ? getAuth(app) : initializeAuth(app, { persistence: inMemoryPersistence });
