/**
 * Renderizador de documentos con la identidad de marca de Tu Asesor Álvaro.
 *
 * Fuente ÚNICA de verdad para el aspecto de los documentos legales (Nota de
 * Encargo, Propuesta de Compraventa, …). Un mismo parser alimenta dos salidas:
 *   - `renderBrandedHtml()`  → HTML A4 (vista previa en el panel + descarga/print).
 *   - el builder de PDF en `documenso.ts` consume `parseDoc()` para el PDF que se
 *     envía a firmar (pdf-lib, serverless-safe).
 *
 * Convenciones del cuerpo de plantilla (texto en `document_templates.body`):
 *   - `## Título de sección`         → encabezado de sección numerado.
 *   - `- Etiqueta: valor`            → fila de datos (clave/valor).
 *   - `- a) texto...`  (sin ": ")    → viñeta de lista.
 *   - cualquier otra línea            → párrafo.
 *   - línea en blanco                 → separación.
 * Las filas cuyo rótulo contiene "precio"/"honorarios" se resaltan en dorado.
 */

export const BRAND = {
  navy: "#0f172a",
  gold: "#FBBF24",
  goldDark: "#b8860b",
  ink: "#283042",
  muted: "#8a93a3",
  line: "#e7eaf0",
  name: "Tu Asesor Álvaro",
  tagline: "Inmobiliaria",
  advisor: "Álvaro López Cuevas",
  dni: "49124002G",
  fiscalAddress: "C/ Hermanos Pinzón 16, Sevilla",
  phone: "697 223 944",
  web: "tuasesoralvaro.com",
  email: "info@tuasesoralvaro.com",
} as const;

export type DocBlock =
  | { type: "section"; text: string }
  | { type: "row"; label: string; value: string; emphasis: boolean }
  | { type: "bullet"; text: string }
  | { type: "paragraph"; text: string };

/** Parser de cuerpo de plantilla (ya combinado con los datos) → bloques. */
export function parseDoc(body: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") continue;

    if (line.startsWith("## ")) {
      blocks.push({ type: "section", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      const rest = line.slice(2).trim();
      const colon = rest.indexOf(": ");
      // clave/valor sólo si el rótulo es corto y no es un "a)" de lista
      if (colon > 0 && colon < 42 && !/^[a-z]\)/i.test(rest)) {
        const label = rest.slice(0, colon).trim();
        const value = rest.slice(colon + 2).trim();
        const emphasis = /precio|honorarios/i.test(label);
        blocks.push({ type: "row", label, value, emphasis });
      } else {
        blocks.push({ type: "bullet", text: rest });
      }
      continue;
    }
    blocks.push({ type: "paragraph", text: line.trim() });
  }
  return blocks;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Resalta los placeholders sin rellenar (________) en gris suave. */
const softFill = (s: string) =>
  esc(s).replace(/_{4,}/g, '<span style="color:#aab2c0">________</span>');

/**
 * Variante "legal" — diseño jurídico clásico para contratos privados:
 *   - Tipografía serif (Iowan/Palatino/Georgia), negro sobre blanco.
 *   - Sin logo ni colores de marca; título centrado en mayúsculas.
 *   - "REUNIDOS / MANIFIESTAN / ESTIPULACIONES" como pilares centrados.
 *   - Hasta 3 firmas en fila al pie.
 */
function renderLegalHtml(meta: BrandedDocMeta, body: string): string {
  const sigs: SignSlot[] = meta.signatures ?? [];
  const place = esc(meta.lugar || "Sevilla");
  const date = esc(meta.fecha || "");

  // Heurística: si una sección es "Reunidos" / "Manifiestan" / "Estipulaciones",
  // se renderiza como pilar centrado en mayúsculas; el resto, párrafo normal.
  const blocks = parseDoc(body);
  const PILLAR = /^(reunidos|manifiestan|estipulaciones)$/i;
  const parts: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { parts.push("</ul>"); inList = false; } };
  for (const b of blocks) {
    if (b.type === "section") {
      closeList();
      if (PILLAR.test(b.text.trim())) {
        parts.push(`<h2 class="pillar">${esc(b.text.toUpperCase())}</h2>`);
      } else {
        parts.push(`<h3 class="stip">${esc(b.text)}</h3>`);
      }
    } else if (b.type === "bullet") {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${softFill(b.text)}</li>`);
    } else if (b.type === "row") {
      closeList();
      parts.push(`<p><b>${softFill(b.label)}:</b> ${softFill(b.value)}</p>`);
    } else {
      closeList();
      parts.push(`<p>${softFill(b.text)}</p>`);
    }
  }
  closeList();

  const signsHtml = sigs.length === 0 ? "" :
    `<div class="signs n${sigs.length}">${sigs.map((s) =>
      `<div class="sign"><div class="line"><div class="who">${esc(s.who)}</div><div class="sub">${esc(s.sub || "")}</div></div></div>`,
    ).join("")}</div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc(meta.title)}</title>
<style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#fff;}
  body{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;color:#111;line-height:1.55;font-size:11pt;}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;padding:25mm 22mm 22mm;}
  h1.title{text-align:center;margin:0 0 4px;font-size:14pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
  .subtitle{text-align:center;margin:0 0 18px;font-size:10pt;font-style:italic;color:#444;}
  h2.pillar{text-align:center;margin:18px 0 10px;font-size:11.5pt;font-weight:700;letter-spacing:6px;text-transform:uppercase;}
  h2.pillar::before,h2.pillar::after{content:"";display:inline-block;width:36px;height:1px;background:#111;vertical-align:middle;margin:0 14px;}
  h3.stip{margin:10px 0 2px;font-size:11pt;font-weight:700;}
  p{margin:5px 0;text-align:justify;text-indent:0;}
  ul{margin:5px 0 5px 0;padding-left:22px;}
  ul li{margin:3px 0;text-align:justify;}
  .signs{display:grid;gap:32px;margin-top:30px;}
  .signs.n1{grid-template-columns:1fr;}
  .signs.n2{grid-template-columns:1fr 1fr;}
  .signs.n3{grid-template-columns:1fr 1fr 1fr;}
  .sign .line{border-top:1px solid #111;margin-top:60px;padding-top:6px;text-align:center;}
  .sign .who{font-weight:700;font-size:10pt;}
  .sign .sub{color:#555;font-size:9pt;margin-top:2px;font-style:italic;}
  .esign{margin-top:18px;text-align:center;font-size:8.6pt;color:#666;font-style:italic;}
  .footer{position:absolute;left:22mm;right:22mm;bottom:12mm;text-align:center;font-size:8pt;color:#888;border-top:1px solid #ddd;padding-top:6px;font-style:italic;}
  @page{size:A4;margin:0;}
  @media print{.page{margin:0;}}
</style></head>
<body><div class="page">
  <h1 class="title">${esc(meta.title)}</h1>
  <p class="subtitle">En ${place}, a ${date}.</p>
  ${parts.join("\n")}
  ${signsHtml}
  <p class="esign">Documento firmado digitalmente mediante Documenso — validez legal eIDAS.</p>
  <div class="footer">Tu Asesor Álvaro · ${esc(BRAND.web)} · Documento confidencial</div>
</div></body></html>`;
}

/** Fila de casillas de firma. */
function signaturesHtml(slots: SignSlot[]): string {
  const cells = slots
    .map(
      (s) =>
        `<div class="sign"><div class="line"><div class="who">${esc(s.who)}</div><div class="sub">${esc(s.sub || "")}</div></div></div>`,
    )
    .join("");
  // siempre 2 columnas para alinear; si hay 1, rellenamos con un hueco
  const filler = slots.length === 1 ? '<div class="sign"></div>' : "";
  return `<div class="signs">${cells}${filler}</div>`;
}

/** Bloque de aceptación destacado (con su propia firma). */
function acceptanceHtml(a: AcceptanceBlock): string {
  const opts = (a.options || [])
    .map((o) => `<span><span class="box"></span>${softFill(o)}</span>`)
    .join("");
  return `<div class="accept">
    <div class="ah"><span class="dot"></span> ${esc(a.heading)}</div>
    <p>${softFill(a.body)}</p>
    ${opts ? `<div class="opts">${opts}</div>` : ""}
    <div class="signs" style="margin-top:6px;">
      <div class="sign"><div class="line"><div class="who">${esc(a.sign.who)}</div><div class="sub">${esc(a.sign.sub || "")}</div></div></div>
      <div class="sign"></div>
    </div>
  </div>`;
}

/** Una casilla de firma (rótulo + subtítulo). */
export interface SignSlot {
  who: string;
  sub?: string;
}

/** Bloque de aceptación destacado (p.ej. el Vendedor acepta la propuesta). */
export interface AcceptanceBlock {
  heading: string;
  body: string;
  /** Opciones tipo casilla (□) que se muestran antes de la firma. */
  options?: string[];
  sign: SignSlot;
}

/**
 * Variantes visuales del documento:
 *   - "corporate" (default): cabecera de marca con logo + navy + dorado.
 *   - "legal":   estilo jurídico clásico (serif, sobrio, sin logo, sin colores).
 *     Usar para contratos privados / escrituras / cualquier documento que deba
 *     leerse como "papel notarial".
 */
export type DocVariant = "corporate" | "legal";

export interface BrandedDocMeta {
  title: string;
  ref?: string;
  lugar?: string;
  fecha?: string;
  /** Logo: en navegador `/logo.png`; en server-render, data URI. */
  logoSrc?: string;
  /** Nombre que firma como cliente (pie de firma). */
  clientLabel?: string;
  /** Casillas de firma. Si se omite → [El Asesor, El Cliente]. */
  signatures?: SignSlot[];
  /** Bloque de aceptación opcional (propuesta de compraventa). */
  acceptance?: AcceptanceBlock;
  /** Variante visual (default: "corporate"). */
  variant?: DocVariant;
}

/**
 * Layout de firmas/aceptación + variante visual según el tipo de documento.
 * FUENTE ÚNICA que consumen tanto la vista previa HTML como el PDF del
 * servidor, de modo que ambas salidas son idénticas.
 *
 * @param category  categoría de la plantilla (`document_templates.category`).
 * @param clientLabel  nombre de quien firma como cliente/proponente.
 * @param parties opcionales: nombres concretos para etiquetar a vendedor/comprador en el contrato privado.
 */
export function docLayout(
  category: string | undefined,
  clientLabel?: string,
  parties?: { sellerName?: string; buyerName?: string },
): { signatures: SignSlot[]; acceptance?: AcceptanceBlock; variant: DocVariant } {
  const cat = (category || "").toLowerCase();

  // Documentos del COMPRADOR: 1 sola firma (Ficha Informativa, KYC, Parte de Visita).
  // Variante corporate (con marca) para transmitir confianza al comprador.
  if (cat.includes("ficha")) {
    return { variant: "corporate", signatures: [{ who: "El Comprador", sub: clientLabel || "Nombre y NIF · Firma" }] };
  }
  if (cat.includes("kyc") || cat.includes("pbc") || cat.includes("titularidad")) {
    return { variant: "corporate", signatures: [{ who: "El Comprador", sub: clientLabel || "Nombre y NIF · Firma" }] };
  }
  if (cat.includes("visita")) {
    return { variant: "corporate", signatures: [{ who: "El Visitante", sub: clientLabel || "Nombre y NIF · Firma" }] };
  }

  if (cat.includes("contrato")) {
    // Contrato privado: 3 firmas — Vendedora, Compradora, Asesor mediador.
    // Variante visual "legal" (sobrio, serif, sin logo ni colores).
    return {
      variant: "legal",
      signatures: [
        { who: "La Parte Vendedora", sub: parties?.sellerName || "Nombre y DNI · Firma" },
        { who: "La Parte Compradora", sub: parties?.buyerName || "Nombre y DNI · Firma" },
        { who: "El Asesor Mediador", sub: BRAND.advisor },
      ],
    };
  }

  if (cat.includes("propuesta")) {
    return {
      variant: "corporate",
      signatures: [
        { who: "El Proponente (Comprador)", sub: clientLabel || "Nombre y NIF · Firma" },
        { who: "El Asesor", sub: BRAND.advisor },
      ],
      acceptance: {
        heading: "Aceptación de la propuesta por la parte vendedora",
        body:
          "Con la firma del presente apartado, el Vendedor ACEPTA formalmente todas las condiciones y plazos establecidos en esta propuesta, adquiriendo las cantidades entregadas la condición legal de Arras Penitenciales (Art. 1.454 C.C.).",
        options: [
          "Oferta conforme con el Encargo de Venta.",
          "Aceptada la propuesta NO conforme con el Encargo de Venta.",
        ],
        sign: { who: "El Vendedor", sub: "Nombre y NIF · Firma" },
      },
    };
  }

  // Por defecto (Nota de encargo y otros): Asesor + Cliente, variante corporate.
  return {
    variant: "corporate",
    signatures: [
      { who: "El Asesor", sub: BRAND.advisor },
      { who: "El Cliente", sub: clientLabel || "La parte firmante" },
    ],
  };
}

/** Renderiza los bloques a fragmentos HTML del cuerpo. */
function blocksToHtml(blocks: DocBlock[]): string {
  const out: string[] = [];
  let n = 0;
  let inList = false;
  let inRows = false;
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  const closeRows = () => { if (inRows) { out.push("</div>"); inRows = false; } };

  for (const b of blocks) {
    if (b.type === "section") {
      closeList(); closeRows();
      n += 1;
      const num = String(n).padStart(2, "0");
      out.push(
        `<div class="sec"><div class="sec-h"><span class="n">${num}</span> ${softFill(b.text)}</div>`,
      );
    } else if (b.type === "row") {
      closeList();
      if (!inRows) { out.push('<div class="rows">'); inRows = true; }
      const cls = b.emphasis ? "r emph" : "r";
      out.push(
        `<div class="${cls}"><div class="k">${softFill(b.label)}</div><div class="v">${softFill(b.value)}</div></div>`,
      );
    } else if (b.type === "bullet") {
      closeRows();
      if (!inList) { out.push('<ul class="bl">'); inList = true; }
      out.push(`<li>${softFill(b.text)}</li>`);
    } else {
      closeList(); closeRows();
      out.push(`<p>${softFill(b.text)}</p>`);
    }
  }
  closeList(); closeRows();
  // cerrar la última sección abierta
  if (n > 0) out.push("</div>");
  return out.join("\n");
}

/** Documento HTML A4 completo, autocontenido (CSS inline), listo para print/PDF. */
export function renderBrandedHtml(meta: BrandedDocMeta, body: string): string {
  if ((meta.variant ?? "corporate") === "legal") return renderLegalHtml(meta, body);

  const blocks = parseDoc(body);
  const logo = meta.logoSrc || "/logo.png";
  const sigs: SignSlot[] = meta.signatures ?? [
    { who: "El Asesor", sub: BRAND.advisor },
    { who: "El Cliente", sub: meta.clientLabel || "La parte firmante" },
  ];
  const acceptance = meta.acceptance;
  const metaLine = [
    meta.ref ? `Ref. ${esc(meta.ref)}` : "",
    `${esc(meta.lugar || "Sevilla")}, ${esc(meta.fecha || "")}`,
  ].filter(Boolean).join(" · ");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc(meta.title)} · ${BRAND.name}</title>
<style>
  :root{--navy:${BRAND.navy};--gold:${BRAND.gold};--gold-2:${BRAND.goldDark};--ink:${BRAND.ink};--muted:${BRAND.muted};--line:${BRAND.line};--line-2:#f1f3f7;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#fff;}
  body{font-family:"Helvetica Neue","Inter",Arial,"Segoe UI",sans-serif;color:var(--ink);line-height:1.5;font-size:10pt;-webkit-font-smoothing:antialiased;}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;padding:16mm 16mm 20mm;}
  .head{display:flex;align-items:center;justify-content:space-between;padding-bottom:9px;border-bottom:1px solid var(--line);}
  .head .brand{display:flex;align-items:center;gap:11px;}
  .head .brand img{height:13mm;width:auto;}
  .head .brand .bn{font-weight:700;color:var(--navy);font-size:12pt;line-height:1;letter-spacing:.2px;}
  .head .brand .bs{color:var(--muted);font-size:7.5pt;letter-spacing:3.5px;text-transform:uppercase;margin-top:4px;}
  .head .doc{text-align:right;}
  .head .doc .acc{height:2px;background:var(--gold);width:46px;margin:0 0 3px auto;}
  .head .doc .t{font-size:15pt;font-weight:300;color:var(--navy);letter-spacing:1px;text-transform:uppercase;}
  .head .doc .t b{font-weight:700;}
  .head .doc .meta{margin-top:4px;font-size:7.6pt;color:var(--muted);letter-spacing:.4px;}
  .advisor{display:flex;flex-wrap:wrap;gap:4px 20px;margin:9px 0 2px;font-size:7.8pt;color:var(--muted);}
  .advisor b{color:var(--ink);font-weight:600;}
  .sec{margin-top:12px;}
  .sec-h{display:flex;align-items:baseline;gap:8px;margin:0 0 5px;font-size:8.8pt;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:1.1px;}
  .sec-h .n{color:var(--gold-2);font-weight:700;}
  .sec p{margin:3px 0;text-align:justify;}
  .rows{margin:2px 0;}
  .rows .r{display:flex;padding:4px 0;border-bottom:1px solid var(--line-2);}
  .rows .r:last-child{border-bottom:0;}
  .rows .r.emph{border-left:2px solid var(--gold);padding-left:10px;}
  .rows .k{flex:0 0 32%;color:var(--muted);font-size:8.4pt;font-weight:600;}
  .rows .r.emph .k{color:var(--gold-2);}
  .rows .v{flex:1;}
  .rows .r.emph .v{font-weight:700;color:var(--navy);}
  ul.bl{margin:4px 0;padding-left:16px;}
  ul.bl li{margin:2.5px 0;text-align:justify;}
  .signs{display:flex;gap:40px;margin-top:20px;}
  .sign{flex:1;}
  .sign .line{border-top:1px solid var(--navy);margin-top:42px;padding-top:5px;}
  .sign .who{font-weight:700;color:var(--navy);font-size:8.4pt;text-transform:uppercase;letter-spacing:1px;}
  .sign .sub{color:var(--muted);font-size:7.6pt;margin-top:1px;}
  .accept{margin-top:16px;border:1px solid var(--gold);border-radius:8px;background:#fffdf6;padding:12px 14px;}
  .accept .ah{font-size:8.6pt;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:8px;}
  .accept .ah .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);}
  .accept p{margin:6px 0;text-align:justify;}
  .opts{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:6px;font-size:8.4pt;color:var(--ink);}
  .opts .box{width:11px;height:11px;border:1.3px solid var(--navy);border-radius:2px;display:inline-block;vertical-align:-1px;margin-right:6px;}
  .esign{margin-top:12px;font-size:7.4pt;color:var(--muted);letter-spacing:.4px;}
  .esign b{color:var(--gold-2);}
  .footer{position:absolute;left:16mm;right:16mm;bottom:11mm;display:flex;justify-content:space-between;align-items:center;padding-top:7px;border-top:1px solid var(--line);font-size:7.2pt;color:var(--muted);}
  .footer b{color:var(--navy);}
  @page{size:A4;margin:0;}
  @media print{.page{margin:0;}}
</style></head>
<body><div class="page">
  <header class="head">
    <div class="brand"><img src="${logo}" alt="${BRAND.name}"><div><div class="bn">${BRAND.name}</div><div class="bs">${BRAND.tagline}</div></div></div>
    <div class="doc"><div class="acc"></div><div class="t">${esc(meta.title)}</div><div class="meta">${metaLine}</div></div>
  </header>
  <div class="advisor">
    <span><b>Asesor:</b> ${BRAND.advisor}</span>
    <span><b>DNI:</b> ${BRAND.dni}</span>
    <span><b>Domicilio fiscal:</b> ${BRAND.fiscalAddress}</span>
    <span><b>Tel.:</b> ${BRAND.phone}</span>
    <span><b>Email:</b> ${BRAND.email}</span>
  </div>
  ${blocksToHtml(blocks)}
  ${signaturesHtml(sigs)}
  ${acceptance ? acceptanceHtml(acceptance) : ""}
  <div class="esign">Documento firmado digitalmente mediante <b>Documenso</b> · validez legal eIDAS.</div>
  <footer class="footer"><span><b>${BRAND.name}</b> · ${BRAND.web} · ${BRAND.email}</span><span>Documento confidencial</span></footer>
</div></body></html>`;
}
