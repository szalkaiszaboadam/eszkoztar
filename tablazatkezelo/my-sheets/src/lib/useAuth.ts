// src/lib/useAuth.ts
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function useAuth() {
  const router = useRouter();

  const register = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Cookie beállítása middleware-hez
      document.cookie = "auth-token=true; path=/; max-age=2592000";
      toast.success("Sikeres regisztráció!");
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(getErrorMessage(error.code));
    }
  };

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      document.cookie = "auth-token=true; path=/; max-age=2592000";
      toast.success("Sikeres belépés!");
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(getErrorMessage(error.code));
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // Cookie törlése
      document.cookie = "auth-token=; path=/; max-age=0";
      router.push("/login");
    } catch {
      toast.error("Hiba történt a kijelentkezéskor.");
    }
  };

  return { register, login, logout };
}

function getErrorMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use": return "Ez az email már használatban van.";
    case "auth/invalid-email": return "Érvénytelen email cím.";
    case "auth/weak-password": return "A jelszó túl gyenge (min. 6 karakter).";
    case "auth/user-not-found": return "Nem található ilyen felhasználó.";
    case "auth/wrong-password": return "Hibás jelszó.";
    case "auth/invalid-credential": return "Hibás email vagy jelszó.";
    default: return "Ismeretlen hiba történt.";
  }
}