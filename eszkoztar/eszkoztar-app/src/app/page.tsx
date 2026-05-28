import Link from "next/link";
import { Barcode, Image as ImageIcon, TableProperties, ArrowRight, Boxes, Download } from "lucide-react";

type Action = {
  label: string;
  type: "open" | "download";
  href: string;
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
    borderHover: "hover:border-blue-200",
    icon: Barcode,
    actions: [
      { label: "Megnyitás", type: "open", href: "/vonalkodolvaso" }
    ]
  },
  {
    title: "Kollázskészítő",
    description: "Képek szerkesztése, összeállítása és kollázsok létrehozása közvetlenül a böngészőből.",
    brandColor: "text-amber-600",
    bgHover: "hover:bg-amber-50",
    borderHover: "hover:border-amber-200",
    icon: ImageIcon,
    actions: [
      { label: "Megnyitás", type: "open", href: "/kollazskeszito" },
    ]
  },
  {
    title: "Táblázatkezelő",
    description: "Adatok rendszerezése, szerkesztése és áttekinthető táblázatos megjelenítése.",
    brandColor: "text-emerald-600",
    bgHover: "hover:bg-emerald-50",
    borderHover: "hover:border-emerald-200",
    icon: TableProperties,
    actions: [
      { label: "Megnyitás", type: "open", href: "/tablazatkezelo" }
    ]
  },
  {
    title: "Termékkezelő",
    description: "Webshopos folyamatok tömeges gyorsítása: automatikus cikkszámozás, kategóriaépítés, címkézés és képkinyerés.",
    brandColor: "text-violet-600",
    bgHover: "hover:bg-violet-50",
    borderHover: "hover:border-violet-200",
    icon: Boxes,
    actions: [
      { label: "Letöltés", type: "download", href: "/termekkezelo/letoltes" }
    ]
  },
];

export default function Home() {
  return (
    /* JAVÍTÁS: min-h-[100dvh] a fix h-screen helyett, és levettük az overflow-hidden-t. 
       Így mobilon görgethető, ha kilóg, de asztalon középre húzza görgetősáv nélkül! */
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center font-sans bg-[#fafafa] py-12 md:py-8">
      <main className="w-full max-w-4xl px-6">
        
        {/* Elkülönített fejléc rész */}
        <div className="text-center mb-10 md:mb-14 flex flex-col items-center">
          <span className="mb-2 md:mb-3 text-xs md:text-sm font-semibold tracking-widest uppercase text-slate-500">
            Eszköztár
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Válassz eszközt!
          </h1>
          <p className="mt-3 text-slate-500 text-sm sm:text-base max-w-sm mx-auto">
            Kattints az alábbi belső modulok egyikére a munka megkezdéséhez.
          </p>
        </div>

        {/* 2x2-es Grid elrendezés - Mobilon 1 oszlop, Tablettől felfelé 2 oszlop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {toolsData.map((tool, index) => {
            const Icon = tool.icon;
            
            return (
              <div
                key={index}
                className={`group relative flex flex-col justify-between bg-white rounded-2xl p-5 md:p-6 min-h-[180px] md:min-h-[190px] border border-slate-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${tool.borderHover}`}
              >
                <div>
                  <div className={`w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center bg-slate-50 transition-colors duration-300 ${tool.bgHover} mb-4`}>
                    <Icon className={`w-5 h-5 ${tool.brandColor}`} strokeWidth={1.5} />
                  </div>
                  
                  <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-1.5 leading-tight">
                    {tool.title}
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                    {tool.description}
                  </p>
                </div>

                {/* Akciók (Gombok) dinamikus megjelenítése */}
                <div className="mt-5 md:mt-4 flex flex-wrap items-center gap-4 md:gap-5">
                  {tool.actions.map((action, actionIdx) => (
                    <Link 
                      key={actionIdx} 
                      href={action.href}
                      className="flex items-center font-medium text-xs md:text-sm text-slate-400 transition-colors duration-300 hover:text-slate-900"
                    >
                      {action.label}
                      {action.type === "open" ? (
                        <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 ml-1.5 transition-transform duration-300 group-hover:translate-x-1" />
                      ) : (
                        <Download className="w-3.5 h-3.5 md:w-4 md:h-4 ml-1.5 transition-transform duration-300 group-hover:-translate-y-0.5" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}