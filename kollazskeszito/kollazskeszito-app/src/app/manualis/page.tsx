import Link from "next/link";

export default function ManualisMode() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", marginBottom: 16 }}>Manuális Mód (Hamarosan)</h1>
      
      {/* VISSZA A FŐOLDALRA: Csak egy szimpla / jel kell ide is! */}
      <Link href="/" style={{ padding: "12px 24px", background: "var(--accent)", color: "#fff", textDecoration: "none", borderRadius: 8, fontWeight: 700 }}>
        ← Vissza a választóhoz
      </Link>
    </div>
  );
}