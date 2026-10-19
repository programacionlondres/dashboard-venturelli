/* Dashboard de avance de obra – lógica de cálculo y vistas.
 * Todos los valores salen de data/avance.json (generado desde la hoja "Gantt Control").
 * Ningún dato se ingresa a mano en la app. */
(function () {
  "use strict";
  var C = { navy: "#1A1846", naranjo: "#E18426", azul: "#002060", celeste: "#9DC3E6", gris: "#ECECEC", rojo: "#C00000", verde: "#2E7D32", texto2: "#595959" };
  var MACRO_POR_ITEM = { "1": "OBRAS PREVIAS", "7": "URBANIZACIÓN", "8": "EQUIPAMIENTO" };
  var DATA = null, MODEL = null, charts = {};
  var state = { semana: null, frente: "Todos", orden: { col: "impacto", asc: true }, buscar: "", estado: "", partida: null, comparar: [] };

  // ---------- utilidades ----------
  var nf0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pct(v, d) { return v === null || v === undefined || isNaN(v) ? "–" : (d === 2 ? nf2 : d === 0 ? nf0 : nf1).format(v * 100) + "%"; }
  function pts(v) { return (v > 0 ? "+" : "") + nf1.format(v); }
  function d2(v) { return v === null || isNaN(v) ? "–" : nf1.format(v); }
  function parseISO(s) { if (!s) return null; var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function fdate(d, corta) {
    if (!d) return "–";
    var dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
    return corta ? dd + "/" + mm : dd + "/" + mm + "/" + d.getFullYear();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cls(v) { return v < -0.0001 ? "neg" : v > 0.0001 ? "pos" : ""; }
  function $(id) { return document.getElementById(id); }

  // ---------- cálculo ----------
  function semanaControlPorDefecto(D) {
    var lim = addDays(parseISO(D.fechaControl), -6), idx = 0;
    D.semanas.forEach(function (s, j) { if (parseISO(s) <= lim) idx = j; });
    return idx;
  }

  function construir(D, c) {
    var nw = D.semanas.length, finSem = addDays(parseISO(D.semanas[c]), 6);
    var L1 = null, L2 = null, partidas = [], frentes = [], grupos = [];
    D.filas.forEach(function (f) {
      if (f.nivel === 1) { L1 = { nombre: f.partida, item: f.item }; L2 = null; frentes.push(f.partida); return; }
      if (f.nivel === 2) { L2 = { nombre: f.partida, frente: L1 ? L1.nombre : "", fila: f.fila }; grupos.push(L2); return; }
      if (!f.hoja) return;
      var macro = (L1 && MACRO_POR_ITEM[String(L1.item).charAt(0)]) || "VIVIENDAS";
      var peso = D.resumen[macro] ? D.resumen[macro].peso : 0;
      var progFinal = f.prog[nw - 1];
      var total = f.unidad === "VIVIENDAS" ? Math.max(D.casas, progFinal) : Math.max(1, progFinal);
      var real = f.real[c], prog = f.prog[c];
      var prev = c > 0 ? f.real[c - 1] : 0, r4 = c >= 4 ? f.real[c - 4] : 0;
      var pReal = Math.min(1, real / total), pProg = Math.min(1, prog / total), dif = pReal - pProg;
      var pend = Math.max(0, total - real), ritmo = (real - r4) / 4;
      var term = parseISO(f.termino), ini = parseISO(f.inicio);
      var semRest = term ? Math.max(1, (term - finSem) / (7 * 86400000)) : 1;
      var req = pend === 0 ? 0 : pend / semRest;
      var vencida = pend > 0 && term && term < finSem;
      var sinAv = null;
      if (real > 0 && pend > 0) { sinAv = 0; for (var k = c - 1; k >= 0 && f.real[k] === real; k--) sinAv++; }
      var proy = pend === 0 ? "Terminada" : ritmo <= 0 ? "Sin ritmo" : addDays(finSem, Math.floor(pend / ritmo * 7));
      var estado = pend === 0 ? "Terminada"
        : (real === 0 && prog > 0) ? "No iniciada (atrasada)"
        : real === 0 ? "Por iniciar"
        : (sinAv !== null && sinAv >= 3 && prog > real) ? "Detenida"
        : dif < -0.1 ? "Atrasada" : dif < -0.0001 ? "Leve atraso" : "Al día / adelantada";
      partidas.push({
        fila: f.fila, item: f.item, partida: f.partida, frente: L1 ? L1.nombre : "", grupo: L2 ? L2.nombre : "", grupoFila: L2 ? L2.fila : null,
        macro: macro, peso: peso, inicio: ini, termino: term, unidad: f.unidad, incid: f.incid,
        total: total, real: real, prog: prog, pReal: pReal, pProg: pProg, dif: dif, semana: real - prev, ritmo: ritmo,
        pend: pend, req: req, vencida: vencida, sinAv: sinAv, proy: proy, impacto: dif * f.incid * peso * 100, estado: estado,
        serieReal: f.real, serieProg: f.prog
      });
    });
    var o = D.resumen.OBRA;
    var pO = progResumen(o, D.resumen);
    var real = o.real[c], prog = pO[c];
    var termObra = parseISO(D.terminoObra);
    var ritmo4 = c >= 4 ? (real - o.real[c - 4]) / 4 : null;
    var semRest = termObra ? (termObra - finSem) / (7 * 86400000) : 0;
    var obra = {
      real: real, prog: prog, dif: prog === null ? null : real - prog,
      semReal: c > 0 ? real - o.real[c - 1] : real,
      semProg: prog === null ? null : c > 0 ? (pO[c - 1] === null ? null : prog - pO[c - 1]) : prog,
      ritmo4: ritmo4, req: semRest > 0 ? (1 - real) / semRest : 1 - real, vencido: semRest <= 0 && real < 0.9995,
      proy: ritmo4 > 0 ? addDays(finSem, Math.floor((1 - real) / ritmo4 * 7)) : null,
      spi: prog > 0 ? real / prog : null, termino: termObra, progDesde: primerProg(o, D.resumen)
    };
    return { c: c, inicioSem: parseISO(D.semanas[c]), finSem: finSem, partidas: partidas, frentes: frentes, grupos: grupos, obra: obra };
  }

  // Programado de una fila resumen: si el Gantt lo trae en 0 mientras ya hay avance real
  // (programado aún no cargado en esas semanas), se muestra "sin dato" en vez de 0.
  //   El corte se toma de la fila OBRA y se aplica igual a los frentes.
  function progResumen(s, R) {
    var o = (R || DATA.resumen).OBRA, first = -1;
    for (var j = 0; j < o.prog.length; j++) if (o.prog[j] > 0) { first = j; break; }
    return s.prog.map(function (v, j) { return (first < 0 || j < first) && o.real[j] > 0 ? null : v; });
  }
  function primerProg(s, R) { var p = progResumen(s, R); for (var j = 0; j < p.length; j++) if (p[j] !== null) return j; return -1; }

  function agregado(lista) {
    var w = 0, r = 0, p = 0;
    lista.forEach(function (x) { w += x.incid; r += x.incid * x.pReal; p += x.incid * x.pProg; });
    return w > 0 ? { real: r / w, prog: p / w } : { real: 0, prog: 0 };
  }
  function filtradas() { return MODEL.partidas.filter(function (x) { return state.frente === "Todos" || x.frente === state.frente; }); }

  // ---------- gráficos ----------
  Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = C.texto2;
  function grafico(id, cfg) {
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 14 } } } }, cfg.options || {});
    charts[id] = new Chart($(id), cfg);
  }
  var ejePct = function (max) { return { min: 0, max: max, ticks: { callback: function (v) { return nf0.format(v * 100) + "%"; } }, grid: { color: "#E6E6E6" } }; };
  var ejeX = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } };

  // ---------- render ----------
  function renderTodo() {
    MODEL = construir(DATA, state.semana);
    $("titulo").textContent = "Dashboard de avance · " + DATA.obra;
    document.title = "Dashboard " + DATA.obra;
    $("subtitulo").textContent = "Semana de control: " + fdate(MODEL.inicioSem) + " al " + fdate(MODEL.finSem) +
      " · Término programado: " + fdate(MODEL.obra.termino) + " · " + DATA.casas + " viviendas";
    $("pie").textContent = "Fuente: " + (DATA.fuente || "Gantt Control") + " · Fecha de control del Gantt: " + fdate(parseISO(DATA.fechaControl)) +
      " · Archivo de datos generado el " + fdate(new Date(DATA.generado));
    renderKpis(); renderLectura(); renderCurvas(); renderFrentes(); renderCategorias(); renderDecisiones(); renderPartidas(); renderDetalle(); renderComparador();
  }

  function kpi(t, v, s, clase) { return '<div class="kpi"><div class="t">' + t + '</div><div class="v ' + (clase || "") + '">' + v + '</div><div class="s">' + (s || "") + "</div></div>"; }
  function renderKpis() {
    var o = MODEL.obra;
    $("kpis").innerHTML =
      kpi("Avance real", pct(o.real)) +
      kpi("Avance programado", o.prog === null ? "–" : pct(o.prog), o.prog === null ? "sin dato en el Gantt" : "") +
      (o.dif === null ? kpi("Diferencia", "–", "sin programado") :
        kpi("Diferencia", pts(o.dif * 100) + " pts", o.dif >= 0 ? "adelanto" : "atraso", o.dif >= 0 ? "bueno" : "malo")) +
      kpi("Avance semana", pct(o.semReal, 2), o.semProg === null ? "programado sin dato" : "programado " + pct(o.semProg, 2), o.semProg === null ? "" : o.semReal >= o.semProg ? "bueno" : "malo") +
      kpi("SPI", o.spi === null ? "–" : nf2.format(o.spi), "real / programado", o.spi >= 1 ? "bueno" : "malo") +
      kpi("Ritmo últ. 4 semanas", o.ritmo4 === null ? "–" : pct(o.ritmo4, 2), "% de obra por semana") +
      (o.vencido ? kpi("Ritmo requerido", "Vencido", "término Gantt " + fdate(o.termino) + " · falta " + pct(1 - o.real), "malo") :
        kpi("Ritmo requerido", pct(o.req, 2), "para terminar el " + fdate(o.termino), o.ritmo4 !== null && o.req > o.ritmo4 ? "malo" : "bueno")) +
      kpi("Proyección término", o.proy ? fdate(o.proy) : "–", "al ritmo de las últimas 4 semanas", o.proy && o.termino && o.proy > o.termino ? "malo" : "bueno");
  }

  function renderLectura() {
    var o = MODEL.obra, f = filtradas();
    var n = function (e) { return f.filter(function (x) { return x.estado === e; }).length; };
    var alc = o.ritmo4 !== null && o.req <= o.ritmo4;
    $("lectura").innerHTML =
      (o.dif === null ? "• Avance real <b>" + pct(o.real) + "</b>. El Gantt no trae avance programado de obra para esta semana. Esta semana avanzó " + pct(o.semReal, 2) + ".<br>" :
      "• La obra va <b>" + (o.dif >= 0 ? "adelantada " : "atrasada ") + nf1.format(Math.abs(o.dif * 100)) + " pts</b> (" + pct(o.real) + " real vs " + pct(o.prog) +
      " programado). Esta semana avanzó " + pct(o.semReal, 2) + (o.semProg === null ? "" : " vs " + pct(o.semProg, 2) + " programado") + ".<br>") +
      (o.ritmo4 === null ? "" : o.vencido ? "• Ritmo de las últimas 4 semanas: <b>" + pct(o.ritmo4, 2) + "/sem</b>. El término del Gantt (" + fdate(o.termino) + ") <b>ya pasó</b> y falta " + pct(1 - o.real) + (o.proy ? "; a este ritmo se terminaría el " + fdate(o.proy) : "") + ".<br>" :
        "• Ritmo de las últimas 4 semanas: <b>" + pct(o.ritmo4, 2) + "/sem</b>. Para terminar en la fecha del Gantt se requiere " + pct(o.req, 2) + "/sem" + (alc ? ": el ritmo actual alcanza." : ": <b>hay que acelerar</b>.") + "<br>") +
      "• Partidas" + (state.frente === "Todos" ? "" : " de " + esc(state.frente)) + ": <b>" + n("Atrasada") + "</b> atrasadas, <b>" + n("Detenida") +
      "</b> detenidas (≥3 semanas sin avance), <b>" + n("No iniciada (atrasada)") + "</b> que debían iniciar y no lo han hecho.";
  }

  function renderCurvas() {
    var c = MODEL.c, o = DATA.resumen.OBRA, pO = progResumen(o), pd = MODEL.obra.progDesde;
    var cp = DATA.correccionProg && DATA.correccionProg.OBRA;
    $("notaCurva").textContent = pd > 0 ? "(el Gantt trae programado de obra desde la semana del " + fdate(parseISO(DATA.semanas[pd])) + ")" :
      cp && cp.hasta ? "(programado hasta la semana del " + fdate(parseISO(cp.hasta)) + " tomado de la tabla diaria del Gantt, fila " + cp.filaTabla + ", porque la fila resumen lo traía en 0)" :
      cp && cp.finalCompletado ? "(las últimas " + cp.finalCompletado + " semanas del Gantt no traen programado; se mantiene el 100%)" : "";
    grafico("chCurva", {
      type: "line",
      data: { labels: DATA.semanas.map(function (s) { return fdate(parseISO(s)); }),
        datasets: [
          { label: "Programado", data: pO, borderColor: C.celeste, borderWidth: 3, pointRadius: 0 },
          { label: "Real", data: o.real.map(function (v, j) { return j <= c ? v : null; }), borderColor: C.navy, borderWidth: 2.5, pointRadius: 0 }
        ] },
      options: { scales: { y: ejePct(1), x: ejeX },
        plugins: { tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + pct(t.raw); } } } } }
    });
    var js = [], lab = [], re = [], pr = [];
    for (var j = Math.max(0, c - 11); j <= c; j++) {
      lab.push(fdate(parseISO(DATA.semanas[j]), true));
      re.push(j > 0 ? o.real[j] - o.real[j - 1] : o.real[j]);
      pr.push(pO[j] === null ? null : j > 0 ? (pO[j - 1] === null ? null : pO[j] - pO[j - 1]) : pO[j]);
    }
    grafico("chSemanal", {
      type: "bar",
      data: { labels: lab, datasets: [
        { label: "Real semana", data: re, backgroundColor: C.navy, borderRadius: 4, maxBarThickness: 22 },
        { label: "Programado semana", data: pr, backgroundColor: C.celeste, borderRadius: 4, maxBarThickness: 22 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return nf1.format(v * 100) + "%"; } }, grid: { color: "#E6E6E6" } }, x: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + pct(t.raw, 2); } } } } }
    });
  }

  function filaTabla(celdas) { return "<tr>" + celdas.join("") + "</tr>"; }
  function td(v, c) { return "<td" + (c ? ' class="' + c + '"' : "") + ">" + v + "</td>"; }
  function barra(v) { return '<div class="barra"><span style="width:' + Math.round(Math.max(0, Math.min(1, v)) * 100) + '%"></span><em>' + pct(v) + "</em></div>"; }

  function renderFrentes() {
    var c = MODEL.c, rows = ["OBRAS PREVIAS", "VIVIENDAS", "URBANIZACIÓN", "EQUIPAMIENTO"].map(function (m) {
      var s = DATA.resumen[m], pm = progResumen(s)[c];
      if (pm === null) return filaTabla([td(m.charAt(0) + m.slice(1).toLowerCase(), "izq"), td(pct(s.peso, 0)), td(barra(s.real[c])), td("–"), td("–")]);
      var d = (s.real[c] - pm) * 100;
      return filaTabla([td(m.charAt(0) + m.slice(1).toLowerCase(), "izq"), td(pct(s.peso, 0)), td(barra(s.real[c])), td(pct(pm)), td(pts(d), cls(d))]);
    });
    $("tblMacro").innerHTML = "<tr><th class=izq>Frente</th><th>Peso</th><th>Real</th><th>Prog.</th><th>Dif. pts</th></tr>" + rows.join("");
    var labs = [], re = [], pr = [];
    MODEL.frentes.forEach(function (fr) {
      var l = MODEL.partidas.filter(function (x) { return x.frente === fr; });
      if (!l.length) return;
      var a = agregado(l); labs.push(fr); re.push(a.real); pr.push(a.prog);
    });
    grafico("chFrentes", {
      type: "bar",
      data: { labels: labs, datasets: [
        { label: "Real", data: re, backgroundColor: C.navy, borderRadius: 4, maxBarThickness: 14 },
        { label: "Programado", data: pr, backgroundColor: C.celeste, borderRadius: 4, maxBarThickness: 14 }] },
      options: { indexAxis: "y", interaction: { mode: "index", intersect: false }, scales: { x: ejePct(1), y: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + pct(t.raw); } } } } }
    });
  }

  function renderCategorias() {
    var gs = MODEL.grupos.filter(function (g) { return state.frente === "Todos" || g.frente === state.frente; });
    $("notaCategoria").textContent = state.frente === "Todos" ? "(todos los frentes)" : "(" + state.frente + ")";
    var h = "<tr><th class=izq>Categoría</th><th class=izq>Frente</th><th>Real</th><th>Prog.</th><th>Dif. pts</th></tr>";
    var b = gs.map(function (g) {
      var l = MODEL.partidas.filter(function (x) { return x.grupoFila === g.fila; });
      if (!l.length) return "";
      var a = agregado(l), d = (a.real - a.prog) * 100;
      return filaTabla([td(esc(g.nombre), "izq"), td(esc(g.frente), "izq"), td(barra(a.real)), td(pct(a.prog)), td(pts(d), cls(d))]);
    }).join("");
    $("tblCategorias").innerHTML = h + (b || '<tr><td colspan=5 class="vacia">Sin categorías para este frente.</td></tr>');
  }

  var COLS_DEC = '<tr><th>N°</th><th class=izq>Partida</th><th class=izq>Frente</th><th>Real</th><th>Programado</th><th>% Real</th><th>% Prog.</th><th>Dif.</th><th>Ritmo 4 sem</th><th>Ritmo req.</th><th>Sem. sin av.</th><th>Impacto pts</th><th>Inicio</th><th>Término</th><th>Estado</th></tr>';
  function cant(v, x) { return x.total > 1 ? (Math.abs(v - Math.round(v)) < 1e-6 ? nf0.format(v) : nf1.format(v)) : pct(Math.min(1, v / x.total), 0); }
  function cantidad(x) { return x.total > 1 ? nf0.format(x.real) + " / " + nf0.format(x.total) : pct(x.pReal, 0); }
  function ritmoTxt(v, x) { return x.total > 1 ? d2(v) : pct(v, 0); }
  function reqTxt(x) { return x.vencida ? '<span class="neg">Vencida</span>' : ritmoTxt(x.req, x); }
  function estadoHtml(e) { return '<span class="estado e-' + e.split(" ")[0] + '">' + e + "</span>"; }
  function filaDec(x, i) {
    return filaTabla([td(i + 1), td('<a href="#" data-fila="' + x.fila + '">' + esc(x.partida) + "</a>", "nombre"), td(esc(x.frente), "izq"),
      td('<b>' + cant(x.real, x) + '</b>'), td(cant(x.prog, x)), td(pct(x.pReal, 0)), td(pct(x.pProg, 0)), td(pts(x.dif * 100), cls(x.dif)), td(ritmoTxt(x.ritmo, x)), td(reqTxt(x)),
      td(x.sinAv === null ? "–" : x.sinAv), td(nf2.format(x.impacto), cls(x.impacto)), td(fdate(x.inicio)), td(fdate(x.termino)), td(estadoHtml(x.estado))]);
  }
  function tablaDec(id, lista, vacio) {
    $(id).innerHTML = COLS_DEC + (lista.length ? lista.slice(0, 10).map(filaDec).join("") : '<tr><td colspan=15 class="vacia">' + vacio + "</td></tr>");
  }
  function renderDecisiones() {
    var f = filtradas(), fin = MODEL.finSem, lim = addDays(fin, 28);
    tablaDec("tblImpacto", f.filter(function (x) { return x.impacto < -0.0001; }).sort(function (a, b) { return a.impacto - b.impacto; }), "No hay partidas con atraso en este filtro.");
    tablaDec("tblDetenidas", f.filter(function (x) { return x.estado === "Detenida"; }).sort(function (a, b) { return b.sinAv - a.sinAv || b.incid - a.incid; }), "No hay partidas detenidas en este filtro.");
    tablaDec("tblNoIniciadas", f.filter(function (x) { return x.estado === "No iniciada (atrasada)"; }).sort(function (a, b) { return a.impacto - b.impacto; }), "No hay partidas que debían iniciar y no lo han hecho.");
    tablaDec("tblProximas", f.filter(function (x) { return x.real === 0 && x.inicio && x.inicio > fin && x.inicio <= lim; }).sort(function (a, b) { return a.inicio - b.inicio; }), "No hay partidas programadas para iniciar en las próximas 4 semanas.");
  }

  var COLS_P = [["partida", "Partida", "izq"], ["frente", "Frente", "izq"], ["grupo", "Categoría", "izq"], ["inicio", "Inicio"], ["termino", "Término"],
    ["real", "Real"], ["prog", "Programado"], ["pReal", "% Real"], ["pProg", "% Prog."], ["dif", "Dif."], ["semana", "Avance semana"], ["ritmo", "Ritmo 4 sem"],
    ["req", "Ritmo req."], ["sinAv", "Sem. sin av."], ["proy", "Proyección"], ["impacto", "Impacto pts"], ["estado", "Estado"]];
  function renderPartidas() {
    var q = state.buscar.toLowerCase(), l = filtradas().filter(function (x) {
      return (!q || x.partida.toLowerCase().indexOf(q) >= 0 || x.grupo.toLowerCase().indexOf(q) >= 0) && (!state.estado || x.estado === state.estado);
    });
    var k = state.orden.col, asc = state.orden.asc ? 1 : -1;
    l.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va instanceof Date) va = va.getTime(); if (vb instanceof Date) vb = vb.getTime();
      if (va === null || va === undefined || typeof va === "string" && typeof vb !== "string") return 1;
      if (vb === null || vb === undefined || typeof vb === "string" && typeof va !== "string") return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * asc;
    });
    var h = "<tr>" + COLS_P.map(function (c) { return '<th data-col="' + c[0] + '" class="' + (c[2] || "") + '">' + c[1] + (k === c[0] ? (asc > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr>";
    $("tblPartidas").innerHTML = h + l.map(function (x) {
      return filaTabla([td('<a href="#" data-fila="' + x.fila + '">' + esc(x.partida) + "</a>", "nombre"), td(esc(x.frente), "izq"), td(esc(x.grupo), "izq"),
        td(fdate(x.inicio)), td(fdate(x.termino)), td('<b>' + cant(x.real, x) + '</b>'), td(cant(x.prog, x)),
        td(barra(x.pReal)), td(pct(x.pProg, 0)), td(pts(x.dif * 100), cls(x.dif)), td(ritmoTxt(x.semana, x)), td(ritmoTxt(x.ritmo, x)), td(reqTxt(x)),
        td(x.sinAv === null ? "–" : x.sinAv), td(x.proy instanceof Date ? fdate(x.proy) : x.proy), td(nf2.format(x.impacto), cls(x.impacto)), td(estadoHtml(x.estado))]);
    }).join("");
    $("cuenta").textContent = l.length + " partidas";
  }

  function opcionesPartidas(sel, valor, conVacio) {
    var html = conVacio ? '<option value="">(sin partida)</option>' : "", act = null;
    MODEL.frentes.forEach(function (fr) {
      var l = MODEL.partidas.filter(function (x) { return x.frente === fr; });
      if (!l.length) return;
      html += '<optgroup label="' + esc(fr) + '">' + l.map(function (x) {
        return '<option value="' + x.fila + '"' + (String(valor) === String(x.fila) ? " selected" : "") + ">" + esc(x.partida) + "</option>";
      }).join("") + "</optgroup>";
    });
    sel.innerHTML = html;
  }
  function porFila(f) { return MODEL.partidas.find(function (x) { return String(x.fila) === String(f); }); }

  function renderDetalle() {
    if (!state.partida || !porFila(state.partida)) {
      var top = MODEL.partidas.slice().sort(function (a, b) { return a.impacto - b.impacto; })[0];
      state.partida = top ? top.fila : null;
    }
    opcionesPartidas($("selPartida"), state.partida, false);
    var x = porFila(state.partida); if (!x) return;
    $("kpisPartida").innerHTML =
      kpi("Real / Total", cantidad(x), x.unidad) + kpi("% Real", pct(x.pReal, 0)) + kpi("% Programado", pct(x.pProg, 0)) +
      kpi("Diferencia", pts(x.dif * 100) + " pts", "", x.dif < -0.0001 ? "malo" : "bueno") +
      kpi("Ritmo 4 sem", ritmoTxt(x.ritmo, x), x.total > 1 ? "unid./semana" : "de la partida / semana") +
      kpi("Ritmo requerido", x.vencida ? "Vencida" : ritmoTxt(x.req, x), x.vencida ? "término Gantt " + fdate(x.termino) + " · pendiente " + (x.total > 1 ? nf0.format(x.pend) : pct(x.pend, 0)) : "para terminar el " + fdate(x.termino), (x.vencida || x.req > x.ritmo) && x.pend > 0 ? "malo" : "bueno") +
      kpi("Semanas sin avance", x.sinAv === null ? "–" : x.sinAv, "", x.sinAv >= 3 ? "malo" : "") +
      kpi("Proyección término", x.proy instanceof Date ? fdate(x.proy) : x.proy, "término Gantt " + fdate(x.termino), x.proy instanceof Date && x.termino && x.proy > x.termino ? "malo" : "") +
      kpi("Estado", x.estado, esc(x.frente) + (x.grupo ? " · " + esc(x.grupo) : ""), /Atrasada|Detenida|No iniciada/.test(x.estado) ? "malo" : /Terminada|Al día/.test(x.estado) ? "bueno" : "");
    var c = MODEL.c, mx = x.total;
    grafico("chPartida", {
      type: "line",
      data: { labels: DATA.semanas.map(function (s) { return fdate(parseISO(s)); }),
        datasets: [
          { label: "Programado acumulado", data: x.serieProg, borderColor: C.celeste, borderWidth: 3, pointRadius: 0 },
          { label: "Real acumulado", data: x.serieReal.map(function (v, j) { return j <= c ? v : null; }), borderColor: C.navy, borderWidth: 2.5, pointRadius: 0 }] },
      options: { scales: { y: { min: 0, suggestedMax: mx, grid: { color: "#E6E6E6" }, ticks: { callback: function (v) { return mx > 1 ? nf0.format(v) : nf0.format(v * 100) + "%"; } } }, x: ejeX },
        plugins: { title: { display: true, text: "Avance acumulado – " + x.partida, color: C.azul, font: { weight: "bold" } },
          tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + (mx > 1 ? d2(t.raw) : pct(t.raw, 0)); } } } } }
    });
    var lab = [], re = [], pr = [];
    for (var j = Math.max(1, c - 11); j <= c; j++) {
      lab.push(fdate(parseISO(DATA.semanas[j]), true));
      re.push(x.serieReal[j] - x.serieReal[j - 1]); pr.push(x.serieProg[j] - x.serieProg[j - 1]);
    }
    grafico("chPartidaSem", {
      type: "bar",
      data: { labels: lab, datasets: [
        { label: "Avance real semana", data: re, backgroundColor: C.naranjo, borderRadius: 4, maxBarThickness: 20 },
        { label: "Programado semana", data: pr, backgroundColor: C.celeste, borderRadius: 4, maxBarThickness: 20 }] },
      options: { scales: { y: { beginAtZero: true, grid: { color: "#E6E6E6" }, ticks: { callback: function (v) { return mx > 1 ? nf1.format(v) : nf0.format(v * 100) + "%"; } } }, x: { grid: { display: false } } },
        plugins: { title: { display: true, text: "Ritmo semanal – últimas 12 semanas", color: C.azul, font: { weight: "bold" } },
          tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + (mx > 1 ? d2(t.raw) : pct(t.raw, 1)); } } } } }
    });
  }

  function renderComparador() {
    if (!state.comparar.length) {
      state.comparar = MODEL.partidas.slice().sort(function (a, b) { return a.impacto - b.impacto; }).slice(0, 6).map(function (x) { return x.fila; });
    }
    var box = $("comparador");
    if (!box.children.length) {
      for (var i = 0; i < 6; i++) {
        var s = document.createElement("select"); s.dataset.i = i;
        s.addEventListener("change", function (e) { state.comparar[+e.target.dataset.i] = e.target.value; renderComparador(); });
        box.appendChild(s);
      }
    }
    Array.prototype.forEach.call(box.children, function (s, i) { opcionesPartidas(s, state.comparar[i] || "", true); });
    var sel = state.comparar.map(porFila).filter(Boolean);
    grafico("chComparar", {
      type: "bar",
      data: { labels: sel.map(function (x) { return x.partida.length > 45 ? x.partida.slice(0, 44) + "…" : x.partida; }),
        datasets: [
          { label: "% Real", data: sel.map(function (x) { return x.pReal; }), backgroundColor: C.navy, borderRadius: 4, maxBarThickness: 14 },
          { label: "% Programado", data: sel.map(function (x) { return x.pProg; }), backgroundColor: C.celeste, borderRadius: 4, maxBarThickness: 14 }] },
      options: { indexAxis: "y", scales: { x: ejePct(1), y: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: function (t) { return t.dataset.label + ": " + pct(t.raw, 0); } } } } }
    });
  }

  // ---------- carga de datos ----------
  function cargar(D, origen) {
    DATA = D;
    state.semana = semanaControlPorDefecto(D);
    state.partida = null; state.comparar = [];
    var ss = $("selSemana");
    ss.innerHTML = D.semanas.slice(0, state.semana + 1).map(function (s, j) {
      var d = parseISO(s); return '<option value="' + j + '">' + fdate(d) + " al " + fdate(addDays(d, 6)) + "</option>";
    }).reverse().join("");
    ss.value = String(state.semana);
    var m0 = construir(D, state.semana);
    $("selFrente").innerHTML = '<option value="Todos">Todos</option>' + m0.frentes.map(function (f) { return '<option>' + esc(f) + "</option>"; }).join("");
    state.frente = "Todos";
    var estados = ["Atrasada", "Detenida", "No iniciada (atrasada)", "Leve atraso", "Al día / adelantada", "Por iniciar", "Terminada"];
    $("selEstado").innerHTML = '<option value="">Todos los estados</option>' + estados.map(function (e) { return "<option>" + e + "</option>"; }).join("");
    $("origen").textContent = origen;
    $("vacio").hidden = true;
    renderTodo();
  }

  function eventos() {
    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("activa", x === b); });
        document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("activo", p.id === "tab-" + b.dataset.tab); });
        Object.keys(charts).forEach(function (k) { charts[k].resize(); });
      });
    });
    $("selSemana").addEventListener("change", function (e) { state.semana = +e.target.value; renderTodo(); });
    $("selFrente").addEventListener("change", function (e) { state.frente = e.target.value; renderLectura(); renderCategorias(); renderDecisiones(); renderPartidas(); });
    $("selEstado").addEventListener("change", function (e) { state.estado = e.target.value; renderPartidas(); });
    $("buscar").addEventListener("input", function (e) { state.buscar = e.target.value; renderPartidas(); });
    $("selPartida").addEventListener("change", function (e) { state.partida = e.target.value; renderDetalle(); });
    $("tblPartidas").addEventListener("click", function (e) {
      var th = e.target.closest("th"); if (!th || !th.dataset.col) return;
      if (state.orden.col === th.dataset.col) state.orden.asc = !state.orden.asc; else { state.orden.col = th.dataset.col; state.orden.asc = true; }
      renderPartidas();
    });
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[data-fila]"); if (!a) return;
      e.preventDefault(); state.partida = a.dataset.fila; renderDetalle();
      document.querySelector('.tab[data-tab="detalle"]').click();
    });
    $("btnCsv").addEventListener("click", function () {
      var cab = ["Fila", "Ítem", "Partida", "Frente", "Categoría", "Unidad", "Inicio", "Término", "Total", "Real", "Programado", "% Real", "% Prog", "Dif", "Avance semana", "Ritmo 4 sem", "Ritmo requerido", "Semanas sin avance", "Proyección", "Impacto pts", "Estado"];
      var l = filtradas().map(function (x) {
        return [x.fila, x.item, x.partida, x.frente, x.grupo, x.unidad, fdate(x.inicio), fdate(x.termino), x.total, x.real, x.prog, x.pReal.toFixed(4), x.pProg.toFixed(4),
          x.dif.toFixed(4), x.semana, x.ritmo.toFixed(2), x.req.toFixed(2), x.sinAv === null ? "" : x.sinAv, x.proy instanceof Date ? fdate(x.proy) : x.proy, x.impacto.toFixed(3), x.estado];
      });
      var csv = [cab].concat(l).map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
      descargar(new Blob(["﻿" + csv], { type: "text/csv" }), "partidas_" + DATA.obra.replace(/\s+/g, "_") + ".csv");
    });
    if ($("archivo")) $("archivo").addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      $("estadoCarga").textContent = "Procesando " + file.name + "…";
      var rd = new FileReader();
      rd.onload = function () {
        setTimeout(function () {
          try {
            var D = GanttParser.parseWorkbook(XLSX, new Uint8Array(rd.result), file.name);
            cargar(D, "Datos cargados desde archivo local (aún no publicados)");
            $("estadoCarga").textContent = "✔ " + D.obra + " · fecha de control " + fdate(parseISO(D.fechaControl)) + " · " + D.filas.filter(function (f) { return f.hoja; }).length + " partidas leídas.";
            $("btnJson").disabled = false;
          } catch (err) {
            $("estadoCarga").textContent = "✖ No se pudo leer el archivo: " + err.message;
          }
        }, 30);
      };
      rd.readAsArrayBuffer(file);
    });
    if ($("btnJson")) $("btnJson").addEventListener("click", function () {
      descargar(new Blob([JSON.stringify(DATA)], { type: "application/json" }), "avance.json");
    });
  }
  function descargar(blob, nombre) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function init() {
    eventos();
    var embebido = document.getElementById("datos-embebidos");
    if (embebido) { cargar(JSON.parse(embebido.textContent), "Datos publicados"); return; }
    fetch("avance.json", { cache: "no-store" })
      .then(function (r) { if (r.ok) return r; return fetch("data/avance.json", { cache: "no-store" }); })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (D) { cargar(D, "Datos publicados"); })
      .catch(function () {
        $("vacio").hidden = false;
        $("subtitulo").textContent = "Sin datos publicados";
        var t = document.querySelector('.tab[data-tab="actualizar"]'); if (t) t.click();
      });
  }
  init();
})();
