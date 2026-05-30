"use client";

import Link from "next/link";

function ModeCard({ title, badge, desc, href, icon }: { title: string, badge: string, desc: string, href: string, icon: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
        padding: 32, display: "flex", flexDirection: "column", gap: 16,
        cursor: "pointer", transition: "all 0.2s ease", height: "100%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 8px 24px var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.03)";
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 32 }}>{icon}</div>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "rgba(91,80,232,0.1)", borderRadius: 6, padding: "4px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {badge}
          </span>
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>{title}</h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
    </Link>
  );
}

export default function ModeSelector() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, margin: "0 auto 20px" }}>⊞</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Válassz kollázs módot</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 16, marginTop: 8 }}>Milyen módszerrel szeretnéd összeállítani a képeket?</p>
      </div>

<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, maxWidth: 1000, width: "100%" }}>
  <ModeCard 
    href="/automata" icon="⚡️" title="Automata" badge="Gyors" 
    desc="Az algoritmus másodpercek alatt megtalálja a legjobb elrendezést. Csak töltsd fel a képeket, és kész is vagy!" 
  />
  <ModeCard 
    href="/segitett" icon="🎯" title="Segített" badge="Okos" 
    desc="Szabad mozgástér, de intelligens mágneses rácsvonalakkal, amik segítenek a tökéletes illesztésben." 
  />
  <ModeCard 
    href="/manualis" icon="🛠️" title="Manuális" badge="Pro" 
    desc="Teljes szabadság. Te kezeled a rétegeket, méreteket és a pontos pozíciókat egy üres vásznon." 
  />
</div>
    </div>
  );
}