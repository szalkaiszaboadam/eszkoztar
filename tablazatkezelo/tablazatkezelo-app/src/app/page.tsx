// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  // Így maradjon: a Next.js automatikusan /tablazatkezelo/login-t csinál belőle!
  redirect("/login");
}