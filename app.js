const { supabaseUrl, supabaseAnonKey, tables } = window.APP_CONFIG || {};
const tableNames = {
  propuestas: "propuestas",
  votacion: "votacion",
  sala: "sala",
  alumno: "alumno",
  ...(tables || {})
};

const $filtroSala = document.getElementById("filtroSala");
const $estadoConexion = document.getElementById("estadoConexion");
const $ultimaActualizacion = document.getElementById("ultimaActualizacion");
const $resultadosCards = document.getElementById("resultadosCards");
const $errorBox = document.getElementById("errorBox");
const $btnBorrarVoto = document.getElementById("btnBorrarVoto");
const $modalBorrar = document.getElementById("modalBorrar");
const $cerrarModalBorrar = document.getElementById("cerrarModalBorrar");
const $modalPasoTexto = document.getElementById("modalPasoTexto");
const $modalSeleccionTexto = document.getElementById("modalSeleccionTexto");
const $modalOpciones = document.getElementById("modalOpciones");
const $modalSinResultados = document.getElementById("modalSinResultados");
const $modalAtras = document.getElementById("modalAtras");
const $modalCerrar = document.getElementById("modalCerrar");
const $modalConfirmar = document.getElementById("modalConfirmar");
const $modalConfirmarTexto = document.getElementById("modalConfirmarTexto");
const $confirmarNo = document.getElementById("confirmarNo");
const $confirmarSi = document.getElementById("confirmarSi");

let supabaseClient = null;
let propuestas = [];
let votos = [];
let salas = [];
let salaSeleccionada = "todas";
let pasoBorrado = 1;
let salaBorrado = null;
let generoBorrado = null;
let alumnoBorrado = null;
let alumnosConVoto = [];

const generosDisponibles = [
  { id: 1, nombre: "Niño" },
  { id: 2, nombre: "Niña" }
];

function mostrarError(mensaje) {
  $errorBox.textContent = mensaje;
  $errorBox.classList.remove("hidden");
}

function ocultarError() {
  $errorBox.classList.add("hidden");
}

function setEstadoConexion(texto, offline = false) {
  $estadoConexion.textContent = texto;
  $estadoConexion.classList.toggle("offline", offline);
}

function actualizarTimestamp() {
  const ahora = new Date();
  $ultimaActualizacion.textContent = `Ultima actualizacion: ${ahora.toLocaleTimeString("es-CL")}`;
}

function normalizarResultados() {
  const conteo = votos.reduce((acc, voto) => {
    const id = voto.id_propuesta;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  let data = propuestas.map((p) => ({
    id: p.id,
    nombre: p.nombre_propuesta,
    id_sala: p.id_sala,
    sala: salas.find((s) => s.id === p.id_sala)?.nombre_sala || `Sala ${p.id_sala}`,
    votos: conteo[p.id] || 0
  }));

  if (salaSeleccionada !== "todas") {
    data = data.filter((d) => String(d.id_sala) === salaSeleccionada);
  }

  data.sort((a, b) => b.votos - a.votos || a.nombre.localeCompare(b.nombre));
  return data;
}

function render(data) {
  if (!data.length) {
    $resultadosCards.innerHTML = "";
    return;
  }

  const max = Math.max(...data.map((d) => d.votos), 1);

  const cardMarkup = (item, idx) => {
    const pct = Math.round((item.votos / max) * 100);
    return `
      <article class="result-card" style="animation-delay:${idx * 40}ms">
        <h3 class="result-title">${item.nombre}</h3>
        <div class="votos-row">
          <span>Votos</span>
          <strong class="votos-count">${item.votos}</strong>
        </div>
        <div class="progress" role="img" aria-label="Barra de progreso de votos">
          <span style="width:${pct}%"></span>
        </div>
      </article>
    `;
  };

  if (salaSeleccionada === "todas") {
    const porSala = data.reduce((acc, item) => {
      const key = String(item.id_sala);
      if (!acc[key]) {
        acc[key] = {
          nombre: item.sala,
          items: []
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {});

    const idsOrdenados = salas
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((s) => String(s.id));

    const idsExtras = Object.keys(porSala)
      .filter((id) => !idsOrdenados.includes(id))
      .sort((a, b) => Number(a) - Number(b));

    const idsFinales = [...idsOrdenados, ...idsExtras].filter((id) => porSala[id]);

    $resultadosCards.innerHTML = idsFinales
      .map((idSala, salaIndex) => {
        const grupo = porSala[idSala];
        const cards = grupo.items
          .map((item, idx) => cardMarkup(item, salaIndex * 10 + idx))
          .join("");
        return `
          <section class="sala-group">
            <h3 class="sala-group-title">${grupo.nombre}</h3>
            <div class="sala-group-grid">${cards}</div>
          </section>
        `;
      })
      .join("");
    return;
  }

  $resultadosCards.innerHTML = data.map((item, idx) => cardMarkup(item, idx)).join("");
}

function abrirModalBorrar() {
  pasoBorrado = 1;
  salaBorrado = null;
  generoBorrado = null;
  alumnoBorrado = null;
  alumnosConVoto = [];
  $modalBorrar.classList.remove("hidden");
  renderPasoBorrado();
}

function cerrarModalBorrar() {
  $modalBorrar.classList.add("hidden");
}

function abrirModalConfirmar() {
  if (!alumnoBorrado) return;
  $modalConfirmarTexto.textContent = `Estas seguro de borrar el voto de ${alumnoBorrado.nombre}?`;
  $modalConfirmar.classList.remove("hidden");
}

function cerrarModalConfirmar() {
  $modalConfirmar.classList.add("hidden");
}

function renderOpciones(opciones, onClick) {
  $modalOpciones.innerHTML = opciones
    .map(
      (opcion, idx) =>
        `<button class="option-btn" type="button" data-index="${idx}">${opcion.label}</button>`
    )
    .join("");

  $modalOpciones.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      onClick(opciones[idx]);
    });
  });
}

async function cargarAlumnosConVoto() {
  const [alumnosResp, votosResp] = await Promise.all([
    supabaseClient
      .from(tableNames.alumno)
      .select("id, nombre, id_sala, id_genero")
      .eq("id_sala", salaBorrado)
      .eq("id_genero", generoBorrado)
      .order("nombre", { ascending: true }),
    supabaseClient.from(tableNames.votacion).select("id_alumno")
  ]);

  if (alumnosResp.error) throw alumnosResp.error;
  if (votosResp.error) throw votosResp.error;

  const idsConVoto = new Set((votosResp.data || []).map((v) => v.id_alumno));
  alumnosConVoto = (alumnosResp.data || []).filter((a) => idsConVoto.has(a.id));
}

function renderPasoBorrado() {
  $modalSinResultados.classList.add("hidden");
  $modalAtras.classList.toggle("hidden", pasoBorrado === 1);

  if (pasoBorrado === 1) {
    $modalPasoTexto.textContent = "Paso 1 de 3";
    $modalSeleccionTexto.textContent = "Selecciona una sala.";
    renderOpciones(
      salas
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((s) => ({ id: s.id, label: s.nombre_sala })),
      (salaElegida) => {
        salaBorrado = salaElegida.id;
        pasoBorrado = 2;
        renderPasoBorrado();
      }
    );
    return;
  }

  if (pasoBorrado === 2) {
    $modalPasoTexto.textContent = "Paso 2 de 3";
    $modalSeleccionTexto.textContent = "Selecciona el genero del alumno.";
    renderOpciones(
      generosDisponibles.map((g) => ({ id: g.id, label: g.nombre })),
      async (generoElegido) => {
        generoBorrado = generoElegido.id;
        pasoBorrado = 3;
        try {
          await cargarAlumnosConVoto();
          renderPasoBorrado();
        } catch (error) {
          mostrarError(`No fue posible cargar alumnos: ${error.message}`);
        }
      }
    );
    return;
  }

  $modalPasoTexto.textContent = "Paso 3 de 3";
  $modalSeleccionTexto.textContent = "Selecciona el alumno que ya emitio su voto.";
  if (!alumnosConVoto.length) {
    $modalOpciones.innerHTML = "";
    $modalSinResultados.classList.remove("hidden");
    return;
  }

  renderOpciones(
    alumnosConVoto.map((a) => ({ id: a.id, label: a.nombre, raw: a })),
    (alumnoElegido) => {
      alumnoBorrado = alumnoElegido.raw;
      abrirModalConfirmar();
    }
  );
}

async function confirmarBorradoVoto() {
  if (!alumnoBorrado) return;

  const { error } = await supabaseClient
    .from(tableNames.votacion)
    .delete()
    .eq("id_alumno", alumnoBorrado.id);

  if (error) {
    mostrarError(`No fue posible borrar el voto: ${error.message}`);
    return;
  }

  cerrarModalConfirmar();
  cerrarModalBorrar();
  await cargarData();
}

function inicializarFlujoBorrado() {
  $btnBorrarVoto.addEventListener("click", abrirModalBorrar);
  $cerrarModalBorrar.addEventListener("click", cerrarModalBorrar);
  $modalCerrar.addEventListener("click", cerrarModalBorrar);
  $modalAtras.addEventListener("click", async () => {
    if (pasoBorrado === 2) {
      pasoBorrado = 1;
    } else if (pasoBorrado === 3) {
      pasoBorrado = 2;
    }
    renderPasoBorrado();
  });

  $confirmarNo.addEventListener("click", cerrarModalConfirmar);
  $confirmarSi.addEventListener("click", async () => {
    await confirmarBorradoVoto();
  });

  $modalBorrar.addEventListener("click", (event) => {
    if (event.target === $modalBorrar) {
      cerrarModalBorrar();
    }
  });

  $modalConfirmar.addEventListener("click", (event) => {
    if (event.target === $modalConfirmar) {
      cerrarModalConfirmar();
    }
  });
}

async function cargarSalas() {
  const { data, error } = await supabaseClient
    .from(tableNames.sala)
    .select("id, nombre_sala")
    .order("id", { ascending: true });

  if (error) throw error;
  salas = data || [];

  const options = salas
    .map((s) => `<option value="${s.id}">${s.nombre_sala}</option>`)
    .join("");
  $filtroSala.insertAdjacentHTML("beforeend", options);
}

async function cargarData() {
  const [propuestasResp, votosResp] = await Promise.all([
    supabaseClient
      .from(tableNames.propuestas)
      .select("id, nombre_propuesta, id_sala")
      .order("id", { ascending: true }),
    supabaseClient.from(tableNames.votacion).select("id_propuesta")
  ]);

  if (propuestasResp.error) throw propuestasResp.error;
  if (votosResp.error) throw votosResp.error;

  propuestas = propuestasResp.data || [];
  votos = votosResp.data || [];

  render(normalizarResultados());
  actualizarTimestamp();
}

function suscribirRealtime() {
  supabaseClient
    .channel("votacion-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: tableNames.votacion
      },
      async () => {
        await cargarData();
      }
    )
    .subscribe((status) => {
      const ok = ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status);
      if (status === "SUBSCRIBED") {
        setEstadoConexion("En vivo");
      }
      if (ok && status !== "SUBSCRIBED") {
        setEstadoConexion("Desconectado", true);
      }
    });
}

function validarConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Falta configurar Supabase. Edita config.js con supabaseUrl y supabaseAnonKey."
    );
  }

  const requeridas = ["propuestas", "votacion", "sala"];
  const faltantes = requeridas.filter((k) => !tableNames?.[k]);
  if (faltantes.length) {
    throw new Error(`Faltan nombres de tablas en config.js: ${faltantes.join(", ")}.`);
  }
}

async function iniciar() {
  try {
    validarConfig();
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    $filtroSala.addEventListener("change", () => {
      salaSeleccionada = $filtroSala.value;
      render(normalizarResultados());
    });

    await cargarSalas();
    await cargarData();
    inicializarFlujoBorrado();
    suscribirRealtime();
    ocultarError();
  } catch (error) {
    console.error(error);
    setEstadoConexion("Error", true);
    mostrarError(`No fue posible cargar la votacion: ${error.message}`);
  }
}

iniciar();
