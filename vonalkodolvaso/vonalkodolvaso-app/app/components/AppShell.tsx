'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, set, remove, runTransaction } from 'firebase/database';
import { db } from '@/app/lib/firebase';
import {
  ScanLine, Layers, Settings, Plus, List, Download, Archive,
  Minus, Trash2, Edit2, Eraser, ChevronUp, ChevronRight,
  PackageOpen, Keyboard, RefreshCw, Zap, Moon, Sun, Check,
} from 'lucide-react';

/* ── Types ── */
interface WorksheetItem { [code: string]: number; }
interface Worksheet { name: string; createdAt: number; items?: WorksheetItem; }
interface AllWorksheets { [id: string]: Worksheet; }
type TabId = 'worksheets' | 'scanner' | 'settings';

const QUICK_VALUES = [1, 2, 3, 4, 5, 10, 12, 20, 24, 50, 100];


function playBeep(ctx: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!ctx.current)
      ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.current.createOscillator();
    const g = ctx.current.createGain();
    osc.connect(g); g.connect(ctx.current.destination);
    osc.frequency.value = 880; g.gain.value = 0.04;
    osc.start(); osc.stop(ctx.current.currentTime + 0.08);
  } catch (_) {}
}

/* ─────────────────────────────────────────────
   AppShell
───────────────────────────────────────────── */
export default function AppShell() {

  /* state */
  const [theme, setTheme]             = useState<'light'|'dark'>('dark');
  const [activeTab, setActiveTab]     = useState<TabId>('worksheets');
  const [allWs, setAllWs]             = useState<AllWorksheets>({});
  const [currentId, setCurrentId]     = useState<string|null>(null);
  const [inventory, setInventory]     = useState<WorksheetItem>({});
  const [isMobile, setIsMobile]       = useState(false);
  const [contMode, setContMode]       = useState(false);
  const [statusMsg, setStatusMsg]     = useState('');
  const [statusVis, setStatusVis]     = useState(false);
  const [overlayOk, setOverlayOk]     = useState(false);
  const [torchVis, setTorchVis]       = useState(false);
  const [torchOn, setTorchOn]         = useState(false);
  const [zoom, setZoom]               = useState(2.0);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [dCode, setDCode]             = useState('---');
  const [dDup, setDDup]               = useState(false);
  const [dCurQty, setDCurQty]         = useState(0);
  const [dQty, setDQty]               = useState(1);
  const [chip, setChip]               = useState(1);
  const [manOpen, setManOpen]         = useState(false);
  const [manVal, setManVal]           = useState('');
  const [ctxVis, setCtxVis]           = useState(false);
  const [ctxPos, setCtxPos]           = useState({ top: 0, left: 0 });
  const [wsDropVis, setWsDropVis]     = useState(false);
  const [wsDropPos, setWsDropPos]     = useState({ bottom: 0, left: 0 });

  /* refs */
  const qrRef       = useRef<any>(null);
  const vTrack      = useRef<MediaStreamTrack|null>(null);
  const paused      = useRef(false);
  const canScan     = useRef(true);
  const lastCode    = useRef('');
  const audioCtx    = useRef<AudioContext|null>(null);
  const acTimer     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const invRef      = useRef<WorksheetItem>({});
  const idRef       = useRef<string|null>(null);
  const contRef     = useRef(false);
  const resetting   = useRef(false);
  const pickerRef   = useRef<HTMLDivElement>(null);
  const deskInRef   = useRef<HTMLInputElement>(null);
  const manInRef    = useRef<HTMLInputElement>(null);
  const itemsUnsub  = useRef<(()=>void)|null>(null);
  const dQtyRef     = useRef(1);

  useEffect(() => { invRef.current  = inventory; }, [inventory]);
  useEffect(() => { idRef.current   = currentId; }, [currentId]);
  useEffect(() => { contRef.current = contMode;  }, [contMode]);
  useEffect(() => { dQtyRef.current = dQty;      }, [dQty]);


  /* ── mobile detect ── */
  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    setZoom(parseFloat(localStorage.getItem('app_zoom') || '2.0'));
  }, []);

  /* ── Firebase ── */
  useEffect(() => {
    const unsub = onValue(ref(db, 'worksheets'), snap => {
      const data: AllWorksheets = snap.val() || {};
      setAllWs(data);
      const ids = Object.keys(data).sort((a,b)=>(data[a].createdAt||0)-(data[b].createdAt||0));
      if (ids.length === 0) {
        setCurrentId(null);
      } else if (!idRef.current || !data[idRef.current]) {
        selectWs(ids[0], data);
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line

  function selectWs(id: string, wsData?: AllWorksheets) {
    setCurrentId(id); idRef.current = id;
    if (itemsUnsub.current) itemsUnsub.current();
    const unsub = onValue(ref(db, `worksheets/${id}/items`), snap => {
      const d: WorksheetItem = snap.val() || {};
      setInventory(d); invRef.current = d;
    });
    itemsUnsub.current = unsub;
    setWsDropVis(false); setCtxVis(false);
  }

  async function createWs() {
    // Date-based name with Firebase counter for same-day duplicates
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const dateLabel = `${yyyy}. ${mm}. ${dd}.`;

    // Atomic increment – works even if previous sheets were deleted
    const counterRef = ref(db, `counters/${dateKey}`);
    const result = await runTransaction(counterRef, (cur) => (cur || 0) + 1);
    const count: number = result.snapshot.val() ?? 1;

    const name = count === 1
      ? `Leltár (${dateLabel})`
      : `Leltár (${dateLabel} - ${count})`;

    const id = 'ws_' + Date.now();
    await set(ref(db, `worksheets/${id}`), {
      name, createdAt: Date.now(), items: {}
    });
    selectWs(id);
  }

  /* ── status ── */
  const showStatus = useCallback((text: string, ms: number) => {
    setStatusMsg(text); setStatusVis(true);
    setTimeout(() => setStatusVis(false), ms);
  }, []);

  /* ── autoclose ── */
  const cancelAC = useCallback(() => {
    if (acTimer.current) { clearTimeout(acTimer.current); acTimer.current = null; }
  }, []);

  const addFromDrawer = useCallback((qty: number) => {
    cancelAC();
    const code = lastCode.current, id = idRef.current, inv = invRef.current;
    if (!id) { alert('Válassz munkalapot!'); return; }
    if (!isNaN(qty) && qty > 0) {
      set(ref(db, `worksheets/${id}/items/${code}`), (inv[code]||0) + qty);
      setDrawerOpen(false);
      setTimeout(() => { paused.current = false; }, 400);
    }
  }, [cancelAC]);

  const closeDrawer = useCallback(() => {
    cancelAC(); setDrawerOpen(false);
    setTimeout(() => { paused.current = false; }, 400);
  }, [cancelAC]);

  const startAC = useCallback(() => {
    cancelAC();
    acTimer.current = setTimeout(() => addFromDrawer(dQtyRef.current), 3000);
  }, [cancelAC, addFromDrawer]);

  /* ── picker ── */
  const resetPicker = useCallback(() => {
    resetting.current = true;
    setDQty(1); setChip(1);
    pickerRef.current?.scrollTo({ top: 50, behavior: 'instant' });
    setTimeout(() => { resetting.current = false; }, 100);
  }, []);

  const handlePickerScroll = useCallback(() => {
    if (!resetting.current) cancelAC();
    const wheel = pickerRef.current;
    if (!wheel) return;
    const items = wheel.querySelectorAll<HTMLElement>('.picker-item');
    const center = wheel.scrollTop + wheel.clientHeight / 2;
    items.forEach(item => {
      if (Math.abs(center - (item.offsetTop + item.clientHeight/2)) < 25) {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const val = item.getAttribute('data-val');
        if (val === 'manual') {
          const inp = item.querySelector<HTMLInputElement>('input');
          if (inp) {
            setDQty(parseInt(inp.value)||1);
            inp.oninput = () => { cancelAC(); setDQty(parseInt(inp.value)||1); };
          }
        } else {
          const v = parseInt(val||'1');
          setDQty(v); setChip(v);
        }
      }
    });
  }, [cancelAC]);

  /* ── scan success ── */
  const onScan = useCallback((code: string) => {
    if (!canScan.current) return;
    lastCode.current = code;
    playBeep(audioCtx);

    if (contRef.current) {
      canScan.current = false; paused.current = true;
      const newQty = (invRef.current[code]||0) + 1;
      setOverlayOk(true);
      showStatus(`BEOLVASVA: ${code}\n(Összesen: ${newQty} db)`, 1400);
      const id = idRef.current; if (!id) return;
      set(ref(db, `worksheets/${id}/items/${code}`), newQty)
        .then(() => {
          navigator.vibrate?.(80);
          setTimeout(() => { setOverlayOk(false); canScan.current=true; paused.current=false; }, 1500);
        })
        .catch(() => { canScan.current=true; paused.current=false; });
    } else {
      paused.current = true; resetPicker();
      const isDup = !!invRef.current[code];
      setDCode(code); setDDup(isDup);
      setDCurQty(invRef.current[code]||0);
      setDQty(1); setChip(1);
      setDrawerOpen(true); startAC();
    }
  }, [showStatus, resetPicker, startAC]);

  /* ── camera ── */
  const setupExtras = useCallback(() => {
    const vid = document.querySelector<HTMLVideoElement>('#reader video');
    if (vid?.srcObject) {
      const track = (vid.srcObject as MediaStream).getVideoTracks()[0];
      vTrack.current = track;
      const caps = track.getCapabilities() as any;
      const z = parseFloat(localStorage.getItem('app_zoom')||'2.0');
      setZoom(z);
      if (z>1 && caps.zoom) track.applyConstraints({advanced:[{zoom:z} as any]}).catch(()=>{});
      setTorchVis(!!caps.torch); setTorchOn(false);
    }
  }, []);

  const startCam = useCallback(async () => {
    if (!isMobile) return;
    const { Html5Qrcode } = await import('html5-qrcode');
    if (qrRef.current?.isScanning) { try { await qrRef.current.stop(); } catch(_){} }
    if (!qrRef.current) qrRef.current = new Html5Qrcode('reader');
    qrRef.current
      .start({facingMode:'environment'}, {fps:25, qrbox:{width:260,height:180}, aspectRatio:1.0}, onScan)
      .then(() => { paused.current=false; setupExtras(); })
      .catch((e:any) => console.error('Kamera hiba:', e));
  }, [isMobile, onScan, setupExtras]);

  const restartCam = async () => {
    try { if (qrRef.current?.isScanning) await qrRef.current.stop(); } catch(_){}
    startCam();
  };

  const toggleTorch = () => {
    const t = vTrack.current; if (!t) return;
    const next = !(t.getSettings() as any).torch;
    (t.applyConstraints({advanced:[{torch:next} as any]}) as Promise<void>)
      .then(() => setTorchOn(next));
  };

  const applyZoom = (v: number) => {
    setZoom(v); localStorage.setItem('app_zoom', String(v));
    vTrack.current?.applyConstraints({advanced:[{zoom:v} as any]}).catch(()=>{});
  };

  /* ── tabs ── */
  const showTab = useCallback(async (id: TabId) => {
    setActiveTab(id); setCtxVis(false); setWsDropVis(false);
    if (id === 'scanner') {
      if (!isMobile) setTimeout(() => deskInRef.current?.focus(), 300);
      else setTimeout(() => startCam(), 300);
    } else {
      if (qrRef.current?.isScanning) qrRef.current.stop().catch(()=>{});
    }
  }, [isMobile, startCam]);

  /* ── scan mode ── */
  const setScanMode = async (fast: boolean) => {
    if (contRef.current === fast) return;
    setContMode(fast); contRef.current = fast;
    if (qrRef.current?.isScanning) {
      paused.current = true; showStatus('Üzemmód váltása...', 800);
      await qrRef.current.stop(); setTimeout(() => startCam(), 150);
    }
  };

  /* ── manual entry ── */
  const openManual = () => { paused.current=true; setManVal(''); setManOpen(true); setTimeout(()=>manInRef.current?.focus(),200); };
  const closeManual = () => { setManOpen(false); if (!drawerOpen) paused.current=false; };
  const submitManual = () => { const c=manVal.trim(); if(c){closeManual();onScan(c);} };

  /* ── inventory CRUD ── */
  const modQty = (code: string, val: number) => {
    const id=idRef.current; if(!id) return;
    const n=(invRef.current[code]||0)+val;
    if (n<=0) remove(ref(db,`worksheets/${id}/items/${code}`));
    else set(ref(db,`worksheets/${id}/items/${code}`),n);
  };
  const delItem = (code: string) => {
    if(confirm('Törli az elemet?')) { const id=idRef.current; if(id) remove(ref(db,`worksheets/${id}/items/${code}`)); }
  };
  const clearAll = () => {
    const id=idRef.current; if(!id){alert('Nincs kiválasztva munkalap!');return;}
    if(confirm('Biztosan törli a munkalap ÖSSZES tételét?'))
      remove(ref(db,`worksheets/${id}/items`))
        .then(()=>{setInventory({});showStatus('Munkalap kiürítve!',1500);})
        .catch(e=>alert('Hiba: '+e));
    setCtxVis(false);
  };

  /* ── worksheet CRUD ── */
  const renameWs = () => {
    const id=idRef.current; if(!id) return;
    const n=prompt('Új név:',allWs[id]?.name||'');
    if(n?.trim()) set(ref(db,`worksheets/${id}/name`),n.trim());
    setCtxVis(false);
  };
  const deleteWs = () => {
    setCtxVis(false);
    const id=idRef.current; if(!id) return;
    if(confirm('VÉGLEGESEN törlöd ezt a munkalapot?'))
      remove(ref(db,`worksheets/${id}`)).then(()=>{setCurrentId(null);idRef.current=null;});
  };

  const openCtxMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
    setCurrentId(id); idRef.current=id;
    setCtxPos({left:Math.min(r.left,window.innerWidth-200), top:r.top-145});
    setCtxVis(true);
  };

  const openWsDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if(wsDropVis){setWsDropVis(false);return;}
    const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
    setWsDropPos({left:Math.max(10,r.left), bottom:window.innerHeight-r.top+10});
    setWsDropVis(true);
  };

  /* ── export ── */
  const exportSheet = async () => {
    const inv=invRef.current;
    if(Object.keys(inv).length===0) return;
    const comment=prompt('Adj meg egy megjegyzést (opcionális):','');
    if(comment===null) return;
    const XLSX=await import('xlsx');
    const date=new Date().toISOString().slice(0,10);
    const safe=comment.replace(/[/\\?%*:|"<>]/g,'-').trim();
    const fileName=`leltar_${date}${safe?'_'+safe:''}.xlsx`;
    const sheetName=safe?safe.substring(0,31):'Leltár';
    const ws=XLSX.utils.json_to_sheet(Object.keys(inv).map(k=>({'Vonalkód':k,'Mennyiség':inv[k]})));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName);
    XLSX.writeFile(wb,fileName);
    setTimeout(()=>{
      if(confirm('A mentés elkészült. Töröljük a munkalap tartalmát?')){
        const id=idRef.current; if(id){ remove(ref(db,`worksheets/${id}/items`)); setInventory({}); }
      }
    },500);
  };

  const exportAll = async () => {
    if(!allWs||Object.keys(allWs).length===0){alert('Nincs adat.');return;}
    const XLSX=await import('xlsx');
    const wb=XLSX.utils.book_new(); let hasData=false;
    Object.keys(allWs).forEach(id=>{
      const w=allWs[id];
      if(w.items&&Object.keys(w.items).length>0){
        hasData=true;
        const sheet=XLSX.utils.json_to_sheet(Object.keys(w.items).map(c=>({'Vonalkód':c,'Mennyiség':w.items![c]})));
        XLSX.utils.book_append_sheet(wb,sheet,w.name.replace(/[\[\]\*\?\/\\]/g,'').substring(0,31)||id);
      }
    });
    if(!hasData){alert('Minden munkalap üres.');return;}
    XLSX.writeFile(wb,`TELJES_LELTAR_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  /* ── click outside ── */
  useEffect(() => {
    const h=(e:MouseEvent|TouchEvent)=>{
      const t=e.target as HTMLElement;
      if(ctxVis && !t.closest('.ctx-menu') && !t.closest('.tab-more-btn')) setCtxVis(false);
      if(wsDropVis && !t.closest('.ws-drop') && !t.closest('.ws-drop-btn')) setWsDropVis(false);
    };
    window.addEventListener('click',h);
    window.addEventListener('touchstart',h,{passive:true});
    return ()=>{ window.removeEventListener('click',h); window.removeEventListener('touchstart',h); };
  },[ctxVis,wsDropVis]);

  /* ── derived ── */
  const wsIds = Object.keys(allWs).sort((a,b)=>(allWs[a].createdAt||0)-(allWs[b].createdAt||0));
  const hasWs = wsIds.length>0;
  const wsName = currentId ? (allWs[currentId]?.name||'---') : '---';
  const invKeys = Object.keys(inventory).reverse();

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="md:flex md:flex-row md:h-dvh md:overflow-hidden">
      {/* ─────────── NAV ─────────── */}
      <nav className={[
        // mobile: fixed TOP bar
        'fixed top-0 left-0 w-full flex bg-surface border-b border-border z-[5000]',
        'pt-[env(safe-area-inset-top)]',
        'h-[calc(56px+env(safe-area-inset-top))]',
        'px-1 items-end',
        // desktop: left sidebar
        'md:relative md:top-auto md:left-auto md:bottom-auto',
        'md:w-nav md:h-dvh',
        'md:flex-col md:border-b-0 md:border-r md:border-border',
        'md:px-0 md:pt-0 md:items-stretch md:justify-start',
      ].join(' ')}>

        {/* Brand (desktop only) */}
        <div className="hidden md:flex items-center gap-2 px-4 h-14 font-extrabold text-[15px] text-t1 tracking-tight border-b border-border shrink-0">
          <ScanLine size={18} className="text-accent" /> Vonalkódolvasó
        </div>

        <NavBtn active={activeTab==='worksheets'} onClick={()=>showTab('worksheets')}>
          <Layers size={18} strokeWidth={1.8} /> <span>Munkalapok</span>
        </NavBtn>

        {hasWs && (
          <NavBtn active={activeTab==='scanner'} onClick={()=>showTab('scanner')}>
            <ScanLine size={18} strokeWidth={1.8} /> <span>Szkenner</span>
          </NavBtn>
        )}

        {/* Spacer (desktop only) */}
        <div className="hidden md:block flex-1" />

        <NavBtn active={activeTab==='settings'} onClick={()=>showTab('settings')}>
          <Settings size={18} strokeWidth={1.8} /> <span>Beállítások</span>
        </NavBtn>

        {/* Version (desktop only) */}
        <div className="hidden md:flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-[11px] font-semibold text-t3">v2.0</span>
        </div>
      </nav>

      {/* ═════════════ WORKSHEETS ═════════════ */}
      <ContentArea id="worksheets" active={activeTab==='worksheets'}>
        {!hasWs ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center text-center p-10 gap-3">
            <div className="w-13 h-13 bg-s2 rounded-xl flex items-center justify-center border border-border mb-1">
              <Layers size={24} className="text-t3" strokeWidth={1.5} />
            </div>
            <p className="text-[16px] font-extrabold text-t1 m-0 tracking-tight">Nincs munkalap</p>
            <p className="text-[13px] text-t2 m-0">Hozd létre az első munkalapot.</p>
            <button onClick={createWs} className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-white text-[13px] font-semibold rounded cursor-pointer hover:bg-accent-hov transition-colors">
              <Plus size={14} /> Létrehozás
            </button>
          </div>
        ) : (
          /* Worksheet view */
          <div className="absolute inset-0 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border shrink-0 md:px-5">
              <span className="text-[15px] font-bold text-t1 tracking-tight">{wsName}</span>
              <button onClick={exportSheet}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface text-t2 text-[12px] font-semibold border border-border rounded cursor-pointer hover:bg-s2 hover:text-t1 transition-colors">
                <Download size={13} strokeWidth={2} /> Export
              </button>
            </div>

            {/* Inventory list */}
            <div className="flex-1 overflow-y-auto">
              {invKeys.length === 0 ? (
                <div className="text-center p-12">
                  <div className="w-12 h-12 bg-s2 rounded-xl flex items-center justify-center border border-border mx-auto mb-3">
                    <PackageOpen size={22} className="text-t3" strokeWidth={1.5} />
                  </div>
                  <p className="text-[15px] font-bold text-t1 mb-1.5 mt-0">A munkalap még üres.</p>
                  <p className="text-[13px] text-t2 mb-3 mt-0">Szkennerrel vagy kézzel add hozzá az első tételt.</p>
                  {hasWs && (
                    <button onClick={()=>showTab('scanner')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-white text-[13px] font-semibold rounded cursor-pointer hover:bg-accent-hov transition-colors">
                      <ScanLine size={14} /> Beolvasás indítása
                    </button>
                  )}
                </div>
              ) : invKeys.map(code => (
                <div key={code}
                  className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border hover:bg-s2 transition-colors md:px-5">
                  <div>
                    <div className="text-[13px] font-bold text-t1 tracking-tight">{code}</div>
                    <div className="text-[12px] font-semibold text-accent mt-0.5">{inventory[code]} db</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <QtyBtn onClick={()=>modQty(code,-1)}><Minus size={13} strokeWidth={2}/></QtyBtn>
                    <QtyBtn onClick={()=>modQty(code,1)}><Plus size={13} strokeWidth={2}/></QtyBtn>
                    <QtyBtn onClick={()=>delItem(code)} className="ml-0.5">
                      <Trash2 size={13} strokeWidth={2} className="text-danger"/>
                    </QtyBtn>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom tab bar */}
            <div className="bg-surface flex items-stretch border-t border-border shrink-0 min-h-[42px]">
              <button onClick={createWs} title="Új munkalap"
                className="bg-transparent border-none border-r border-border px-3 flex items-center justify-center text-t2 cursor-pointer hover:bg-s2 hover:text-t1 transition-colors shrink-0">
                <Plus size={15} strokeWidth={2} />
              </button>
              <button onClick={openWsDrop}
                className="ws-drop-btn bg-transparent border-none border-r border-border px-3 flex items-center justify-center text-t2 cursor-pointer hover:bg-s2 hover:text-t1 transition-colors shrink-0">
                <List size={15} strokeWidth={2} />
              </button>
              <div className="flex overflow-x-auto flex-1" style={{scrollbarWidth:'none'}}>
                {wsIds.map(id => (
                  <div key={id}
                    className={[
                      'flex items-center gap-1.5 px-3 cursor-pointer text-[12px] font-semibold whitespace-nowrap',
                      'border-r border-border bg-transparent min-h-[42px] transition-all',
                      id===currentId
                        ? 'bg-accent-lt text-accent font-bold border-b-2 border-b-accent'
                        : 'text-t2 hover:bg-s2 hover:text-t1',
                    ].join(' ')}>
                    <span onClick={()=>selectWs(id)}>{allWs[id].name}</span>
                    <span className="tab-more-btn opacity-35 hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={(e)=>openCtxMenu(e,id)}>
                      <ChevronUp size={13} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab context menu */}
        {ctxVis && (
          <div className="ctx-menu fixed z-[10000] bg-surface border border-border rounded-lg shadow-lg overflow-hidden min-w-[178px]"
            style={{top:ctxPos.top, left:ctxPos.left}}>
            <CtxItem icon={<Edit2 size={14}/>} onClick={renameWs}>Átnevezés</CtxItem>
            <CtxItem icon={<Eraser size={14}/>} onClick={clearAll}>Tartalom törlése</CtxItem>
            <CtxItem icon={<Trash2 size={14}/>} onClick={deleteWs} danger>Munkalap törlése</CtxItem>
          </div>
        )}

        {/* Worksheet list dropdown */}
        {wsDropVis && (
          <div className="ws-drop fixed z-[10000] bg-surface border border-border rounded-lg shadow-lg overflow-hidden min-w-[210px] max-h-[50vh] overflow-y-auto"
            style={{left:wsDropPos.left, bottom:wsDropPos.bottom}}>
            <div className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-t3 bg-s2 border-b border-border">
              Munkalapok
            </div>
            {[...wsIds].sort((a,b)=>(allWs[b].createdAt||0)-(allWs[a].createdAt||0)).map(id=>{
              const active=id===currentId;
              return (
                <div key={id} onClick={()=>selectWs(id)}
                  className={[
                    'flex items-center justify-between px-3.5 py-2.5 text-[13px] cursor-pointer border-b border-border transition-colors',
                    active ? 'bg-accent-lt text-accent font-bold' : 'text-t1 font-medium hover:bg-s2',
                  ].join(' ')}>
                  <span>{allWs[id].name}</span>
                  <ChevronRight size={13} className="opacity-35"/>
                </div>
              );
            })}
          </div>
        )}
      </ContentArea>

      {/* ═════════════ SCANNER ═════════════ */}
      <ContentArea id="scanner" active={activeTab==="scanner"} className="bg-black md:bg-bg">

        {/* Mode switcher (mobile only) */}
        <div className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 flex bg-black/65 backdrop-blur p-0.5 rounded z-[4500] gap-0.5">
          <ModeBtn active={!contMode} onClick={()=>setScanMode(false)}><Layers size={13}/> Interaktív</ModeBtn>
          <ModeBtn active={contMode}  onClick={()=>setScanMode(true)}><Zap size={13}/> Gyors</ModeBtn>
        </div>

        {/* Camera (mobile) – fills all space, ws-bar sits on top via absolute */}
        <div className="md:hidden relative flex-1 w-full">
          <div id="reader" />
          <div className={`scan-overlay${overlayOk?' success-flash':''}`} />
          {statusVis && (
            <div className="absolute top-[12%] left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2.5 rounded text-[13px] font-semibold text-center whitespace-pre-line z-[4000] backdrop-blur pointer-events-none">
              {statusMsg}
            </div>
          )}
          {/* Camera controls – above ws-bar (ws-bar ~42px) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-3.5 z-[4000]"
            style={{bottom:'calc(42px + 16px)'}}>
            <CamBtn onClick={openManual} title="Kézi bevitel"><Keyboard size={17} strokeWidth={1.8}/></CamBtn>
            <CamBtn onClick={restartCam} title="Újraindítás"><RefreshCw size={17} strokeWidth={1.8}/></CamBtn>
            {torchVis && (
              <CamBtn onClick={toggleTorch} active={torchOn} title="Vaku">
                <Zap size={17} strokeWidth={1.8}/>
              </CamBtn>
            )}
          </div>

          {/* WsBar: mobile, inside the camera area at bottom */}
          <ScannerWsBar
            wsIds={wsIds}
            allWs={allWs}
            currentId={currentId}
            onSelect={(id) => { selectWs(id); }}
            onCreate={createWs}
            mobileOnly
          />
        </div>

        {/* Desktop: flex column – input centered, ws-bar at bottom */}
        <div className="hidden md:flex flex-col flex-1 bg-bg overflow-hidden">
          {/* Centered input area */}
          <div className="flex flex-col items-center justify-center flex-1 gap-3.5 p-10">
            <div className="w-16 h-16 bg-accent-lt border border-accent-mid rounded-lg flex items-center justify-center mb-1">
              <ScanLine size={28} className="text-accent" strokeWidth={1.5}/>
            </div>
            <p className="text-[18px] font-extrabold text-t1 tracking-tight m-0">Asztali beolvasó</p>
            <p className="text-[13px] text-t2 m-0 text-center max-w-[280px] leading-relaxed font-medium">
              Használj kézi szkennert vagy gépeld be a kódot, majd nyomj Enter-t.
            </p>
            <input ref={deskInRef} type="text" placeholder="Kód beolvasása..."
              onKeyPress={e=>{
                if(e.key==='Enter'){const v=(e.target as HTMLInputElement).value.trim();if(v){onScan(v);(e.target as HTMLInputElement).value='';}}
              }}
              className={[
                'w-[360px] px-4.5 py-3.5 text-[19px] font-semibold text-t1 bg-surface',
                'border border-border rounded-lg outline-none text-center shadow-sm',
                'transition-[border-color,box-shadow] placeholder:text-t3 placeholder:font-normal',
                'focus:border-accent focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
              ].join(' ')}
            />
          </div>
          {/* WsBar: desktop, pinned to bottom */}
          <ScannerWsBar
            wsIds={wsIds}
            allWs={allWs}
            currentId={currentId}
            onSelect={(id) => { selectWs(id); }}
            onCreate={createWs}
            desktopOnly
          />
        </div>
      </ContentArea>

      {/* ═════════════ SETTINGS ═════════════ */}
      <ContentArea id="settings" active={activeTab==='settings'} className="overflow-y-auto">
        <div className="p-6 max-w-[520px] md:p-7">
          <h3 className="text-[18px] font-extrabold text-t1 tracking-tight m-0 mb-5">Beállítások</h3>

          <SettingsGroup label="Kamera">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="text-[14px] font-semibold text-t1">Zoom szint</div>
              <div className="flex items-center gap-2.5">
                <input type="range" min={1} max={5} step={0.1} value={zoom}
                  onChange={e=>applyZoom(parseFloat(e.target.value))}
                  className="w-[120px] cursor-pointer"/>
                <span className="text-[13px] font-bold text-t2 whitespace-nowrap">{zoom.toFixed(1)}x</span>
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup label="Adatmentés">
            <button onClick={exportAll}
              className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-s2 transition-colors text-left border-none bg-transparent">
              <Archive size={15} className="text-accent shrink-0"/>
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-t1">Összes munkalap exportálása</span>
                <span className="text-[12px] text-t2">Egyetlen .xlsx fájlba, külön füleken</span>
              </div>
            </button>
          </SettingsGroup>

    
        </div>
      </ContentArea>

      {/* ═════════════ DRAWER ═════════════ */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[8000] animate-fade-in" onClick={closeDrawer}/>
      )}
      <div className={[
        'fixed left-0 right-0 bg-surface rounded-t-2xl border-t border-border z-[9000] shadow-lg',
        'px-5 transition-[bottom] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'pb-[calc(22px+env(safe-area-inset-bottom))]',
        drawerOpen ? 'bottom-0' : '-bottom-full',
        dDup ? 'duplicate-active' : '',
      ].join(' ')}>
        <div className="w-8 h-0.5 bg-border rounded-full mx-auto mt-3 mb-4"/>
        <div className="text-center">
          <div className="text-2xl font-extrabold text-t1 mb-1 break-all tracking-tight">
            {dCode}
            {dDup && (
              <span className="inline-block ml-2 text-[11px] font-bold text-warning bg-amber-100 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                ⚠️ Már szerepel
              </span>
            )}
          </div>
          <div className="text-[13px] font-medium text-t2 mb-4">Készleten: {dCurQty} db</div>

          {/* Qty chips */}
          <div className="overflow-x-auto py-3 mb-0.5 flex" style={{scrollbarWidth:'none'}}
            onScroll={cancelAC} onTouchStart={cancelAC}>
            <div className="flex gap-1.5" style={{padding:'0 38%'}}>
              {QUICK_VALUES.map(v=>(
                <div key={v} onClick={()=>{setDQty(v);setChip(v);cancelAC();}}
                  className={[
                    'min-w-[48px] h-12 rounded flex items-center justify-center font-bold text-[14px] cursor-pointer border transition-all',
                    chip===v
                      ? 'bg-accent text-white border-accent'
                      : 'bg-s2 text-t2 border-border hover:border-accent-mid hover:text-accent',
                  ].join(' ')}>
                  {v}
                </div>
              ))}
            </div>
          </div>

          {/* Picker */}
          <div className="picker-container mb-1.5">
            <div className="picker-selection-frame"/>
            <div className="picker-wheel" ref={pickerRef} onScroll={handlePickerScroll}>
              <div className="picker-item" data-val="manual">
                <input type="number" placeholder="Egyéni..." onFocus={cancelAC}
                  onChange={e=>{cancelAC();setDQty(parseInt(e.target.value)||1);}}/>
              </div>
              {QUICK_VALUES.map(v=>(
                <div key={v} className={`picker-item${dQty===v?' active':''}`} data-val={String(v)}>{v}</div>
              ))}
            </div>
          </div>

          <button onClick={()=>addFromDrawer(dQty)}
            className="w-full h-11 text-[14px] font-bold bg-accent text-white rounded cursor-pointer hover:bg-accent-hov transition-colors">
            Hozzáadás
          </button>
          <button onClick={closeDrawer}
            className="w-full bg-transparent border-none text-[13px] text-t3 cursor-pointer mt-2.5 py-1">
            Mégse
          </button>
        </div>
      </div>

      {/* ═════════════ MANUAL MODAL ═════════════ */}
      {manOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center"
          onClick={closeManual}>
          <div className="bg-surface border border-border rounded-lg shadow-lg w-[88%] max-w-sm p-5 animate-slide-up"
            onClick={e=>e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-t1 tracking-tight m-0 mb-3.5">Kézi bevitel</h3>
            <input ref={manInRef} type="text" placeholder="Vonalkód..."
              value={manVal} onChange={e=>setManVal(e.target.value)}
              onKeyPress={e=>{if(e.key==='Enter')submitManual();}}
              className={[
                'w-full px-3.5 py-2.5 bg-s2 border border-border rounded text-[16px] font-medium text-t1',
                'mb-3.5 outline-none transition-[border-color] placeholder:text-t3 placeholder:font-normal',
                'focus:border-accent focus:bg-surface',
              ].join(' ')}
            />
            <div className="flex gap-2">
              <button onClick={closeManual}
                className="flex-1 py-1.5 bg-surface text-t2 border border-border rounded text-[13px] font-semibold cursor-pointer hover:bg-s2 hover:text-t1 transition-colors">
                Mégse
              </button>
              <button onClick={submitManual}
                className="flex-1 py-1.5 bg-accent text-white rounded text-[13px] font-semibold cursor-pointer hover:bg-accent-hov transition-colors flex items-center justify-center gap-1.5">
                <Check size={14}/> Rögzítés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

function ContentArea({ id, active, children, className='' }: {
  id: string; active: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div id={id} className={[
      // mobile: fixed, fills space below top nav to bottom of screen
      'fixed inset-x-0 bottom-0 flex-col overflow-hidden bg-bg',
      'top-[calc(56px+env(safe-area-inset-top))]',
      active ? 'flex' : 'hidden',
      // desktop: static, flex-1 inside the flex-row wrapper
      'md:relative md:inset-auto md:bottom-auto md:top-auto',
      'md:h-dvh md:flex-1 md:overflow-hidden',
      active ? 'md:flex' : 'md:hidden',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

function NavBtn({ active, onClick, children }: {
  active: boolean; onClick: ()=>void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className={[
      // mobile: flex-1, column, small uppercase
      'flex-1 flex flex-col items-center justify-center gap-1',
      'pt-2 pb-2.5 border-none bg-transparent cursor-pointer transition-colors',
      'text-[10px] font-bold uppercase tracking-[0.8px] relative',
      active ? 'text-accent' : 'text-t3',
      // active indicator (mobile bottom line)
      'before:content-[""] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2',
      'before:w-5 before:h-0.5 before:bg-accent before:rounded-b before:transition-transform',
      active ? 'before:scale-x-100' : 'before:scale-x-0',
      // desktop: full width row
      'md:flex-none md:w-[calc(100%-12px)] md:mx-1.5 md:flex-row md:justify-start md:gap-2.5',
      'md:py-2.5 md:px-4 md:text-[13px] md:normal-case md:tracking-[-0.1px] md:font-semibold md:rounded',
      'md:before:hidden',
      active ? 'md:bg-accent-lt md:text-accent' : 'md:hover:bg-s2 md:hover:text-t1',
    ].join(' ')}>
      {children}
    </button>
  );
}

function QtyBtn({ onClick, children, className='' }: {
  onClick: ()=>void; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick}
      className={`w-[30px] h-[30px] flex items-center justify-center bg-surface border border-border rounded-md cursor-pointer hover:bg-s2 hover:text-t1 transition-colors ${className}`}>
      {children}
    </button>
  );
}

function CamBtn({ onClick, title, active=false, children }: {
  onClick: ()=>void; title?: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className={[
        'w-[46px] h-[46px] rounded-full flex items-center justify-center border cursor-pointer transition-colors backdrop-blur-sm',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-black/55 border-white/20 text-white hover:bg-black/75',
      ].join(' ')}>
      {children}
    </button>
  );
}

function ModeBtn({ active, onClick, children }: {
  active: boolean; onClick: ()=>void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3.5 py-1.5 rounded text-[12px] font-semibold cursor-pointer transition-all',
        active ? 'bg-accent text-white' : 'text-white/55 hover:text-white/80',
      ].join(' ')}>
      {children}
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <div className="mb-5">
      <span className="block text-[11px] font-bold uppercase tracking-[1px] text-t3 mb-2">{label}</span>
      <div className="bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function CtxItem({ icon, onClick, danger=false, children }: {
  icon: React.ReactNode; onClick: ()=>void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <div onClick={onClick}
      className={[
        'flex items-center gap-2.5 px-3.5 py-3 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-s2',
        danger ? 'text-danger' : 'text-t1',
      ].join(' ')}>
      <span className={danger ? 'text-danger' : 'text-t2'}>{icon}</span>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────
   ScannerWsBar – mobileOnly vagy desktopOnly proppal hívva
   Mobilon: absolute bottom-0 a kamera felett, világos bg
   Desktopon: border-t bottom bar, mint a Munkalapok oldalon
───────────────────────────────────────── */
function ScannerWsBar({ wsIds, allWs, currentId, onSelect, onCreate, mobileOnly, desktopOnly }: {
  wsIds: string[];
  allWs: AllWorksheets;
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}) {
  if (wsIds.length === 0) return null;

  const isMobileBar = !!mobileOnly;

  const inner = (
    <>
      <button
        onClick={onCreate}
        title="Új munkalap"
        className="shrink-0 px-3 flex items-center justify-center text-t2 border-r border-border hover:bg-s2 hover:text-t1 transition-colors"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
      <div className="flex overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        {wsIds.map(id => {
          const active = id === currentId;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={[
                'flex items-center border-r border-border transition-all whitespace-nowrap shrink-0 bg-transparent',
                isMobileBar ? 'px-3 py-2.5 text-[11px] font-bold' : 'px-3.5 text-[12px] font-semibold min-h-[42px]',
                active
                  ? 'bg-accent-lt text-accent font-bold border-b-2 border-b-accent'
                  : 'text-t2 hover:bg-s2 hover:text-t1',
              ].join(' ')}
            >
              {allWs[id]?.name ?? id}
            </button>
          );
        })}
      </div>
    </>
  );

  if (mobileOnly) return (
    <div className="absolute bottom-0 left-0 right-0 z-[4800] flex items-stretch bg-surface border-t border-border min-h-[42px]">
      {inner}
    </div>
  );

  if (desktopOnly) return (
    <div className="flex items-stretch bg-surface border-t border-border shrink-0 min-h-[42px]">
      {inner}
    </div>
  );

  return null;
}