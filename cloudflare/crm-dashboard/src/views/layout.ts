export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// R10.2: só o primeiro nome. Telefone (formatado ou não), e-mail e vazio viram "cliente".
export function primeiroNome(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t || t.includes("@")) return "cliente";
  if ((t.match(/\d/g) ?? []).length >= 5) return "cliente";
  return t.split(/\s+/)[0];
}

export const ICONES = {
  ok: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  att: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M8 3v6M8 12.2v.3"/></svg>',
  bad: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  peq: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 8h10"/></svg>',
} as const;

export function chip(tipo: keyof typeof ICONES, texto: string): string {
  return `<span class="chip ${tipo}">${ICONES[tipo]}${esc(texto)}</span>`;
}

export const CSS = `
:root{--nl-black:#0D0D0D;--nl-yellow:#F6DB2C;--nl-gray-bg:#F4F4F2;--nl-gray-border:#E3E3E0;--nl-text-muted:#6B6B66;
--nl-green:#1E7A34;--nl-red:#B3261E;--nl-amber:#8A6A00;--nl-green-soft:#E3F1E6;--nl-red-soft:#F8E4E2;--nl-amber-soft:#FBF2C7;--nl-side:#141414}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--nl-gray-bg);color:var(--nl-black);font-size:14px;line-height:1.45}
a:focus-visible,button:focus-visible{outline:3px solid var(--nl-yellow);outline-offset:2px}
.header{background:var(--nl-black);color:#fff;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.header .marca{display:flex;align-items:center;gap:12px}.header img{width:38px;height:38px;border-radius:9px}
.header h1{margin:0;font-size:19px;font-weight:800}.header h1 span{color:var(--nl-yellow);font-weight:600}
.badge{background:var(--nl-yellow);color:var(--nl-black);font-weight:700;font-size:12px;padding:6px 12px;border-radius:20px}
.layout{display:flex;align-items:flex-start}
.side{width:220px;flex-shrink:0;background:var(--nl-side);color:#D6D6D1;padding:20px 0;min-height:100vh}
.side .g{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A8A8A0;padding:0 22px;margin:18px 0 6px}
.side a{display:block;padding:12px 22px 12px 19px;border-left:3px solid transparent;color:#D6D6D1;text-decoration:none;font-size:13.5px}
.side a.on{background:rgba(246,219,44,.10);color:#fff;font-weight:700;border-left-color:var(--nl-yellow)}
.nav-mobile{display:none}
.main{flex:1;min-width:0;padding:24px 36px 56px;max-width:1280px}
.num{font-variant-numeric:tabular-nums}
.tabela{background:#fff;border:1px solid var(--nl-gray-border);border-radius:12px;overflow:hidden;margin-bottom:22px}
.aviso{margin-bottom:16px;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:600;background:var(--nl-amber-soft);border:1px solid #E2CD66}
.chip{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;padding:6px 10px;border-radius:999px;min-height:32px}
.ok{background:var(--nl-green-soft);color:var(--nl-green)}.att{background:var(--nl-amber-soft);color:#5a4500}
.bad{background:var(--nl-red-soft);color:var(--nl-red)}.peq{background:#ECECE8;color:var(--nl-text-muted)}
.hint{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--nl-gray-border);color:var(--nl-text-muted);font-size:12px;font-weight:800;margin-left:6px;cursor:help;position:relative;border:0}
.hint .tip{display:none;position:absolute;left:28px;top:-4px;z-index:5;width:260px;background:var(--nl-black);color:#fff;font-weight:400;font-size:12px;padding:10px 12px;border-radius:8px;text-align:left}
.hint:hover .tip,.hint:focus .tip{display:block}
@media (max-width:900px){.hint{width:44px;height:44px;font-size:14px}.side{display:none}.nav-mobile{display:flex;gap:8px;padding:10px 16px;background:var(--nl-side);flex-wrap:wrap}.nav-mobile a{color:#fff;font-size:13px;padding:10px 12px;border-radius:6px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}.nav-mobile a.on{background:var(--nl-yellow);color:var(--nl-black);font-weight:700}.main{padding:16px}.header{padding:14px 16px}}
`;

export interface ArgsShell {
  titulo: string;
  ativo: "kpi" | "vend";
  selo: string;
  conteudo: string;
  css?: string;
}

export function renderShell(a: ArgsShell): string {
  const link = (href: string, view: "kpi" | "vend", texto: string) =>
    `<a href="${href}" data-view="${view}"${a.ativo === view ? ' class="on" aria-current="page"' : ""}>${esc(texto)}</a>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.titulo)}</title><style>${CSS}${a.css ?? ""}</style></head>
<body>
<header class="header"><div class="marca"><h1>Painel CRM <span>· NL Sales</span></h1></div><span class="badge">${esc(a.selo)}</span></header>
<nav class="nav-mobile" aria-label="Menu">${link("/kpis", "kpi", "NL Sales KPIs")}${link("/kpis/vendedores", "vend", "Performance por vendedor")}<a href="/">Placar e roteamento</a></nav>
<div class="layout">
<nav class="side" aria-label="Menu">
  <div class="g">Comercial</div>
  ${link("/kpis", "kpi", "NL Sales KPIs")}
  ${link("/kpis/vendedores", "vend", "Performance por vendedor")}
  <div class="g">Operação</div>
  <a href="/">Placar e roteamento</a>
</nav>
<main class="main">${a.conteudo}</main>
</div></body></html>`;
}
