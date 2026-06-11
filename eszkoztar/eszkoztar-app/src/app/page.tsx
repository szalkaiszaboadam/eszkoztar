import Link from "next/link";
import { Barcode, Image as ImageIcon, TableProperties, ArrowRight, Boxes, Download } from "lucide-react";

type Action = {
  label: string;
  type: "open" | "download";
  href: string;
  disabled?: boolean; // Ezt a sort add hozzá!
};

type Tool = {
  title: string;
  description: string;
  brandColor: string;
  bgHover: string;
  borderHover: string;
  icon: React.ElementType;
  actions: Action[];
};

const toolsData: Tool[] = [
  {
    title: "Vonalkódolvasó",
    description: "Vonalkódok beolvasása és leltárkezelés — gyors rögzítés, áttekinthető nyilvántartás.",
    brandColor: "text-blue-600",
    bgHover: "hover:bg-blue-50",
    borderHover: "hover:border-blue-300",
    icon: Barcode,
    actions: [
      { label: "Megnyitás", type: "open", href: "/vonalkodolvaso" },
    ]
  },
  {
    title: "Kollázskészítő",
    description: "Képek szerkesztése, összeállítása és kollázsok létrehozása közvetlenül a böngészőből.",
    brandColor: "text-violet-600",
    bgHover: "hover:bg-violet-50",
    borderHover: "hover:border-violet-300",
    icon: ImageIcon,
    actions: [
      { label: "Megnyitás", type: "open", href: "/kollazskeszito" },
    ]
  },
  {
    title: "Táblázatkezelő",
    description: "Adatok rendszerezése, szerkesztése és áttekinthető táblázatos megjelenítése.",
    brandColor: "text-emerald-700",
    bgHover: "hover:bg-emerald-50",   
    borderHover: "hover:border-emerald-300",
    icon: TableProperties,
    actions: [
      { label: "Megnyitás", type: "open", href: "/tablazatkezelo" },
     
    ]
  },
  {
    title: "Termékkezelő",
    description: "Webshopos folyamatok tömeges gyorsítása: automatikus cikkszámozás, kategóriaépítés és címkézés.",
    brandColor: "text-amber-600",
    bgHover: "hover:bg-amber-50",
    borderHover: "hover:border-amber-300",
    icon: Boxes,
    actions: [
      { label: "Megnyitás", type: "open", href: "/termekkezelo", disabled: true},
      { label: "Letöltés", type: "download", href: "/termekkezelo/letoltes" , disabled: true}
    ]
  },
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center font-sans bg-[#f4f4f5] py-8 md:py-4">
      <main className="w-full max-w-4xl px-4 sm:px-6">
        
        {/* Fejléc: Kisebb alsó margóval, hogy spóroljunk a hellyel asztalon */}
        <div className="text-center mb-8 md:mb-10 flex flex-col items-center">
          <span className="mb-2 text-xs md:text-sm font-bold tracking-[0.15em] uppercase text-slate-500">
            Eszköztár
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Válassz eszközt!
          </h1>
          <p className="mt-3 text-slate-600 text-sm md:text-base max-w-md mx-auto font-medium">
            Kattints az alábbi belső modulok egyikére a munka megkezdéséhez.
          </p>
        </div>

        {/* 2x2-es Grid elrendezés - Feszesebb térközökkel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {toolsData.map((tool, index) => {
            const Icon = tool.icon;
            
            return (
              <div
                key={index}
                className={`group relative flex flex-col justify-between bg-white rounded-2xl p-5 md:p-6 border-2 border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg ${tool.borderHover}`}
              >
                <div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 transition-colors duration-300 ${tool.bgHover} mb-4`}>
                    <Icon className={`w-6 h-6 ${tool.brandColor}`} strokeWidth={2} />
                  </div>
                  
                  <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-1.5 leading-tight">
                    {tool.title}
                  </h2>
                  <p className="text-sm md:text-base text-slate-600 leading-snug font-medium">
                    {tool.description}
                  </p>
                </div>

                {/* Gombok: Feszesebb felső margó, picit optimalizált padding */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {tool.actions.map((action, actionIdx) => {
                    // Ha a gomb ki van kapcsolva (disabled), akkor egy szürke, kattinthatatlan taget rajzolunk
                    if (action.disabled) {
                      return (
                        <span 
                          key={actionIdx} 
                          className="inline-flex items-center justify-center px-4 py-2.5 text-sm md:text-base font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl cursor-not-allowed opacity-70"
                        >
                          {action.label}
                          {action.type === "open" ? (
                            <ArrowRight className="w-4 h-4 ml-2" strokeWidth={2.5} />
                          ) : (
                            <Download className="w-4 h-4 ml-2" strokeWidth={2.5} />
                          )}
                        </span>
                      );
                    }

                    // Egyébként marad a normál, kattintható gomb
                    return (
                      <Link 
                        key={actionIdx} 
                        href={action.href}
                        className="inline-flex items-center justify-center px-4 py-2.5 text-sm md:text-base font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl transition-colors hover:bg-slate-200 hover:text-slate-900 active:bg-slate-300"
                      >
                        {action.label}
                        {action.type === "open" ? (
                          <ArrowRight className="w-4 h-4 ml-2" strokeWidth={2.5} />
                        ) : (
                          <Download className="w-4 h-4 ml-2" strokeWidth={2.5} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}