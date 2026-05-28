import Link from "next/link";
import { Barcode, Image as ImageIcon, TableProperties, ArrowRight } from "lucide-react";

// 1. Szigorú TypeScript definíció
type Tool = {
  title: string;
  description: string;
  href: string;
  brandColor: string;
  bgHover: string;
  borderHover: string;
  icon: React.ElementType;
};

// 2. Letisztult adatstruktúra (Nincs SVG spagetti!)
const toolsData: Tool[] = [
  {
    title: "Vonalkódolvasó",
    description: "Vonalkódok beolvasása és leltárkezelés — gyors rögzítés, áttekinthető nyilvántartás.",
    href: "/vonalkodolvaso",
    brandColor: "text-blue-600",
    bgHover: "hover:bg-blue-50",
    borderHover: "hover:border-blue-200",
    icon: Barcode,
  },
  {
    title: "Kollázskészítő",
    description: "Képek szerkesztése, összeállítása és kollázsok létrehozása közvetlenül a böngészőből.",
    href: "/kollazskeszito",
    brandColor: "text-amber-600",
    bgHover: "hover:bg-amber-50",
    borderHover: "hover:border-amber-200",
    icon: ImageIcon,
  },
  {
    title: "Táblázatkezelő",
    description: "Adatok rendszerezése, szerkesztése és áttekinthető táblázatos megjelenítése.",
    href: "/tablazatkezelo",
    brandColor: "text-emerald-600",
    bgHover: "hover:bg-emerald-50",
    borderHover: "hover:border-emerald-200",
    icon: TableProperties,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen pb-24 font-sans">
      <div className="bg-grid-pattern" />

      {/* Modern, áttetsző navigáció */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <span className="font-semibold text-sm tracking-tight text-slate-800">
            Eszköztár
          </span>
        </div>
      </header>

      <main>
        <div className="text-center pt-24 pb-16 px-6">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
            Válassz eszközt!
          </h1>
          <p className="mt-4 text-slate-500 text-sm sm:text-base max-w-xl mx-auto">
            Kezdd el a munkát a belső rendszereinkkel. Válassz a lenti modulok közül.
          </p>
        </div>

        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {toolsData.map((tool, index) => {
              const Icon = tool.icon;
              
              return (
                <Link
                  key={index}
                  href={tool.href}
                  className={`group relative flex flex-col justify-between bg-white rounded-2xl p-6 min-h-[220px] border border-slate-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${tool.borderHover}`}
                >
                  <div>
                    {/* Ikon konténer */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 transition-colors duration-300 ${tool.bgHover} mb-5`}>
                      <Icon className={`w-6 h-6 ${tool.brandColor}`} strokeWidth={1.5} />
                    </div>
                    
                    <h2 className="text-lg font-semibold text-slate-900 mb-2 leading-tight">
                      {tool.title}
                    </h2>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>

                  {/* Diszkrét gomb a kártya alján */}
                  <div className="mt-6 flex items-center font-medium text-sm text-slate-400 transition-colors duration-300 group-hover:text-slate-900">
                    Megnyitás
                    <ArrowRight className="w-4 h-4 ml-1.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}