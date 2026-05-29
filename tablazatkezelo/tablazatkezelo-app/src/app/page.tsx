// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  // A gyökér helyett az almappa alatti loginra irányítunk
  redirect("/tablazatkezelo/login");
}