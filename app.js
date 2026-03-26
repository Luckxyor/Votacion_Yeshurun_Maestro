const { supabaseUrl, supabaseAnonKey, tables } = window.APP_CONFIG || {};
const tableNames = {
  propuestas: "propuestas",
  votacion: "votacion",
  sala: "sala",
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

let supabaseClient = null;
let propuestas = [];
let votos = [];
let salas = [];
let salaSeleccionada = "todas";
let pasoBorrado = 1;
let salaBorrado = null;

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

  const renderSalaGroup = (nombreSala, items, salaIndex) => {
    const cards = items.map((item, idx) => cardMarkup(item, salaIndex * 10 + idx)).join("");
    return `
      <section class="sala-group">
        <div class="sala-group-head">
          <h3 class="sala-group-title">${nombreSala}</h3>
        </div>
        <div class="sala-group-grid">${cards}</div>
      </section>
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
        return renderSalaGroup(grupo.nombre, grupo.items, salaIndex);
      })
      .join("");

    return;
  }

  const idSala = Number(salaSeleccionada);
  const nombreSala = salas.find((s) => s.id === idSala)?.nombre_sala || `Sala ${idSala}`;
  $resultadosCards.innerHTML = renderSalaGroup(nombreSala, data, 0);
}

function renderOpcionesBorrado(opciones, onClick) {
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

function abrirModalBorrar() {
  pasoBorrado = 1;
  salaBorrado = null;
  $modalBorrar.classList.remove("hidden");
  renderPasoBorrado();
}

function cerrarModalBorrar() {
  $modalBorrar.classList.add("hidden");
}

async function borrarUltimoVotoDePropuesta(idPropuesta) {
  const { data: ultimoVoto, error: errorUltimo } = await supabaseClient
    .from(tableNames.votacion)
    .select("id_voto")
    .eq("id_propuesta", idPropuesta)
    .order("id_voto", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorUltimo) throw errorUltimo;
  if (!ultimoVoto?.id_voto) {
    throw new Error("La propuesta no tiene votos para borrar.");
  }

  const { error: errorDelete } = await supabaseClient
    .from(tableNames.votacion)
    .delete()
    .eq("id_voto", ultimoVoto.id_voto);

  if (errorDelete) throw errorDelete;
}

function renderPasoBorrado() {
  $modalSinResultados.classList.add("hidden");
  $modalAtras.classList.toggle("hidden", pasoBorrado === 1);

  if (pasoBorrado === 1) {
    $modalPasoTexto.textContent = "Paso 1 de 2";
    $modalSeleccionTexto.textContent = "Selecciona una sala.";
    renderOpcionesBorrado(
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

  $modalPasoTexto.textContent = "Paso 2 de 2";
  $modalSeleccionTexto.textContent =
    "Selecciona una propuesta con al menos 1 voto. Se borrara el ultimo voto.";

  const idsPropuestaConVoto = new Set(votos.map((v) => v.id_propuesta));
  const propuestasDeSalaConVoto = propuestas
    .filter((p) => p.id_sala === salaBorrado && idsPropuestaConVoto.has(p.id))
    .sort((a, b) => a.id - b.id);

  if (!propuestasDeSalaConVoto.length) {
    $modalOpciones.innerHTML = "";
    $modalSinResultados.classList.remove("hidden");
    return;
  }

  const conteoPorPropuesta = votos.reduce((acc, voto) => {
    acc[voto.id_propuesta] = (acc[voto.id_propuesta] || 0) + 1;
    return acc;
  }, {});

  renderOpcionesBorrado(
    propuestasDeSalaConVoto.map((p) => ({
      id: p.id,
      label: `${p.nombre_propuesta} (${conteoPorPropuesta[p.id] || 0} voto/s)`
    })),
    async (propuestaElegida) => {
      try {
        await borrarUltimoVotoDePropuesta(propuestaElegida.id);
        await cargarData();
        cerrarModalBorrar();
      } catch (error) {
        mostrarError(`No fue posible borrar el voto: ${error.message}`);
      }
    }
  );
}

function inicializarFlujoBorrado() {
  $btnBorrarVoto.addEventListener("click", abrirModalBorrar);
  $cerrarModalBorrar.addEventListener("click", cerrarModalBorrar);
  $modalCerrar.addEventListener("click", cerrarModalBorrar);
  $modalAtras.addEventListener("click", () => {
    if (pasoBorrado === 2) {
      pasoBorrado = 1;
      renderPasoBorrado();
    }
  });

  $modalBorrar.addEventListener("click", (event) => {
    if (event.target === $modalBorrar) {
      cerrarModalBorrar();
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
    supabaseClient.from(tableNames.votacion).select("id_propuesta, id_voto")
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
