document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;

    const tools = [
        {
            id: 'kollazs',
            label: 'Kollázskészítő',
            sub: 'Képszerkesztő',
            color: '#d97706',
            href: '../kollazskeszito/',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"/>`
        },
        {
            id: 'keszlet',
            label: 'Készletkezelő',
            sub: 'Leltárkezelés',
            color: '#2563eb',
            href: '../keszletkezelo/',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>`
        }
    ];

    const active = tools.find(t => path.includes(t.id)) || null;

    function toolItem(t) {
        const isCurrent = active && active.id === t.id;
        return `
<${isCurrent ? 'div' : `a href="${t.href}"`} class="eh-item ${isCurrent ? 'eh-active' : ''}" style="${isCurrent ? `--eh-active-bg:${t.color}1f;` : ''}${!isCurrent ? 'text-decoration:none;' : ''}">            <div class="eh-icon" style="background:${t.color}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">${t.icon}</svg>
            </div>
            <div>
               <div class="eh-label" ${isCurrent ? `style="color:${t.color}"` : ''}>${t.label}</div>
                <div class="eh-sub">${t.sub}</div>
            </div>
         ${isCurrent ? `<svg style="margin-left:auto;color:${t.color}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>` : ''}
        </${isCurrent ? 'div' : 'a'}>`;
    }

    const el = document.createElement('div');
    el.id = 'eszkoztar-header';
    el.innerHTML = `
    <style>
        #eszkoztar-header {
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 52px;
            background: rgba(22,22,20,0.92);
            border-bottom: 1px solid #252522;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            z-index: 99999;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        [data-theme="light"] #eszkoztar-header {
            background: rgba(236,238,244,0.92);
            border-bottom-color: #d8dbe8;
        }
        #eszkoztar-header + * { margin-top: 52px; }
        body { padding-top: 52px; }

        .eh-left { display:flex; align-items:center; gap:10px; }
        .eh-logo { width:28px; height:28px; background:#d97706; border-radius:7px; display:grid; place-items:center; flex-shrink:0; }

        .eh-switcher-btn {
            background:none; border:none; cursor:pointer;
            display:flex; align-items:center; gap:6px;
            font-family:'Plus Jakarta Sans',sans-serif;
            font-size:15px; font-weight:800;
            letter-spacing:-0.02em;
            color: #f2efe8;
            padding:4px 8px; border-radius:6px;
            transition:background 0.15s;
        }
        [data-theme="light"] .eh-switcher-btn { color: #111218; }
        .eh-switcher-btn:hover { background:rgba(255,255,255,0.08); }
        [data-theme="light"] .eh-switcher-btn:hover { background:rgba(0,0,0,0.06); }

        .eh-dropdown {
            display:none; position:absolute;
            top:calc(100% + 8px); left:0;
            min-width:230px;
            background:#1e1e1b;
            border:1px solid #252522;
            border-radius:12px;
            box-shadow:0 24px 60px rgba(0,0,0,0.5);
            padding:6px; z-index:99999;
        }
        [data-theme="light"] .eh-dropdown {
            background:#ffffff;
            border-color:#d8dbe8;
            box-shadow:0 24px 60px rgba(0,0,0,0.12);
        }
        .eh-dropdown.open { display:block; }

        .eh-item {
            display:flex; align-items:center; gap:10px;
            padding:8px 10px; border-radius:7px;
            transition:background 0.15s; cursor:pointer;
            color:#f2efe8;
        }
        [data-theme="light"] .eh-item { color:#111218; }
        .eh-item:hover:not(.eh-active) { background:rgba(255,255,255,0.06); }
        [data-theme="light"] .eh-item:hover:not(.eh-active) { background:#f0f1f5; }
        .eh-active { background:var(--eh-active-bg); }

        .eh-icon { width:28px; height:28px; border-radius:7px; display:grid; place-items:center; flex-shrink:0; }
        .eh-label { font-size:13px; font-weight:600; }
        .eh-active .eh-label { font-weight:700; }
        .eh-sub { font-size:11px; color:#7a7870; }
        [data-theme="light"] .eh-sub { color:#b0b3bf; }
        .eh-divider { height:1px; background:#252522; margin:5px 4px; }
        [data-theme="light"] .eh-divider { background:#d8dbe8; }

        .eh-home {
            display:flex; align-items:center; gap:10px;
            padding:8px 10px; border-radius:7px;
            text-decoration:none; transition:background 0.15s;
            color:#f2efe8;
        }
        [data-theme="light"] .eh-home { color:#111218; }
        .eh-home:hover { background:rgba(255,255,255,0.06); }
        [data-theme="light"] .eh-home:hover { background:#f0f1f5; }
        .eh-home-label { font-size:13px; font-weight:600; }
        .eh-home-sub { font-size:11px; color:#7a7870; }

        .eh-theme-btn {
            width:32px; height:32px;
            border-radius:6px;
            border:1px solid #252522;
            background:#1e1e1b;
            color:#7a7870;
            cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            transition:all 0.2s;
        }
        [data-theme="light"] .eh-theme-btn {
            border-color:#d8dbe8;
            background:#ffffff;
            color:#b0b3bf;
        }
        .eh-theme-btn:hover { color:#f2efe8; border-color:#3e3d39; }
        [data-theme="light"] .eh-theme-btn:hover { color:#111218; border-color:#a0a3b8; }
        .eh-theme-btn svg { width:15px; height:15px; }
    </style>

    <div class="eh-left">
        <div style="position:relative;">
            <button class="eh-switcher-btn" id="eh-btn">
                Eszköztár
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div class="eh-dropdown" id="eh-dropdown">
                ${tools.map(toolItem).join('<div class="eh-divider"></div>')}
                <div class="eh-divider"></div>
                <a class="eh-home" href="../index.html">
                    <div class="eh-icon" style="background:#2a2a26;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>
                        </svg>
                    </div>
                    <div>
                        <div class="eh-home-label">Eszköztár főoldal</div>
                        <div class="eh-home-sub">Összes eszköz</div>
                    </div>
                </a>
            </div>
        </div>
    </div>

    <button class="eh-theme-btn" id="eh-theme-btn" title="Téma váltása">
        <svg id="eh-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
        </svg>
        <svg id="eh-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
        </svg>
    </button>`;

    document.body.insertBefore(el, document.body.firstChild);

    // Dropdown
    document.getElementById('eh-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('eh-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', function() {
        const d = document.getElementById('eh-dropdown');
        if (d) d.classList.remove('open');
    });

    // Téma — szinkronizál a meglévő toggleTheme()-mel ha van, különben önállóan kezeli
    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        document.getElementById('eh-icon-sun').style.display  = t === 'dark' ? '' : 'none';
        document.getElementById('eh-icon-moon').style.display = t === 'dark' ? 'none' : '';
        try { localStorage.setItem('eszkoztar-theme', t); } catch(e) {}
    }

    let initTheme = 'dark';
    try { initTheme = localStorage.getItem('eszkoztar-theme') || 'dark'; } catch(e) {}
    applyTheme(initTheme);

    document.getElementById('eh-theme-btn').addEventListener('click', function() {
        const cur = document.documentElement.getAttribute('data-theme');
        applyTheme(cur === 'dark' ? 'light' : 'dark');
        // Ha az oldalnak van saját toggleTheme() függvénye, azt is hívjuk
    });
});