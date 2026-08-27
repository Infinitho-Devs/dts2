/* ==========================================================================
   Pink Night - Days to Shine 2026 | Confirmacion de asistencia
   --------------------------------------------------------------------------
   El formulario ya esta preparado para conectarse a un backend (PHP + MySQL,
   Node, etc.). Solo hay que definir el endpoint:

     Opcion A (recomendada, sin tocar el JS):
       <form id="form-asistencia" data-endpoint="https://tu-dominio.com/api/asistencia.php">

     Opcion B: cambiar CONFIG.endpoint aqui abajo.

   Mientras endpoint este vacio, el formulario valida y muestra la pantalla de
   exito en modo demo, sin enviar nada a ningun lado.

   El envio es POST con JSON:
     { nombre, apellido, cedula, cedula_formateada, telefono, telefono_formateado,
       correo, evento, origen, enviado_en }
   Respuesta esperada: HTTP 2xx con { "ok": true }
   Duplicado: HTTP 409 con { "ok": false, "error": "duplicado" }
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    endpoint: '',          // se sobreescribe con data-endpoint si existe
    metodo: 'POST',
    evento: 'pink-night-2026-pink-carpet',
    timeoutMs: 15000,
    demoDelayMs: 900       // solo aplica en modo demo
  };

  /* ---------------------------------------------------------------- DOM -- */
  var form      = document.getElementById('form-asistencia');
  if (!form) return;

  var boton     = document.getElementById('btn-enviar');
  var botonTxt  = boton.querySelector('.texto');
  var aviso     = document.getElementById('aviso');
  var estado    = document.getElementById('estado');
  var vistaForm = document.getElementById('vista-form');
  var vistaOk   = document.getElementById('vista-exito');

  var campos = {
    nombre:   document.getElementById('nombre'),
    apellido: document.getElementById('apellido'),
    cedula:   document.getElementById('cedula'),
    telefono: document.getElementById('telefono'),
    correo:   document.getElementById('correo'),
    correo2:  document.getElementById('correo2')
  };
  var honeypot = document.getElementById('sitio-web');

  if (form.dataset.endpoint) CONFIG.endpoint = form.dataset.endpoint.trim();

  var enviando = false;
  var abiertoEn = Date.now();   // control anti-bot por tiempo

  /* -------------------------------------------------------- Validadores -- */
  var RE_NOMBRE = /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ][a-zA-ZáéíóúüñÁÉÍÓÚÜÑ'’.\- ]{1,59}$/;
  var RE_CORREO = /^[^\s@]+@[^\s@,]+\.[a-zA-Z]{2,}$/;

  function soloDigitos(v) { return (v || '').replace(/\D/g, ''); }

  /** Formatea 11 digitos como 000-0000000-0 */
  function formatearCedula(v) {
    var d = soloDigitos(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 10) + '-' + d.slice(10);
  }

  /**
   * Verifica el digito de control de la cedula dominicana (JCE).
   * Los primeros 10 digitos se multiplican alternando 1 y 2; si el producto
   * pasa de 9 se le restan 9. El digito 11 completa la decena.
   */
  function cedulaValida(digitos) {
    if (!/^\d{11}$/.test(digitos)) return false;
    if (/^(\d)\1{10}$/.test(digitos)) return false;   // 00000000000, 11111111111...
    var suma = 0;
    for (var i = 0; i < 10; i++) {
      var p = parseInt(digitos.charAt(i), 10) * (i % 2 === 0 ? 1 : 2);
      if (p > 9) p -= 9;
      suma += p;
    }
    var control = (10 - (suma % 10)) % 10;
    return control === parseInt(digitos.charAt(10), 10);
  }

  /**
   * Formatea el telefono. Numeros dominicanos como 000-000-0000; si empieza
   * con "+" se respeta el formato internacional que escriba la persona.
   */
  function formatearTelefono(v) {
    v = (v || '').trim();
    if (v.charAt(0) === '+') {
      return '+' + soloDigitos(v).slice(0, 15);
    }
    var d = soloDigitos(v).slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  }

  /** Codigos de area de Republica Dominicana. */
  var AREAS_RD = ['809', '829', '849'];

  var reglas = {
    nombre: function (v) {
      if (!v) return 'Escribe tu nombre.';
      if (v.length < 2) return 'El nombre es muy corto.';
      if (!RE_NOMBRE.test(v)) return 'Usa solo letras.';
      return '';
    },
    apellido: function (v) {
      if (!v) return 'Escribe tu apellido.';
      if (v.length < 2) return 'El apellido es muy corto.';
      if (!RE_NOMBRE.test(v)) return 'Usa solo letras.';
      return '';
    },
    cedula: function (v) {
      var d = soloDigitos(v);
      if (!d) return 'Escribe tu cédula.';
      if (d.length !== 11) return 'La cédula debe tener 11 dígitos.';
      if (!cedulaValida(d)) return 'Esa cédula no es válida. Verifícala.';
      return '';
    },
    telefono: function (v) {
      var internacional = v.charAt(0) === '+';
      var d = soloDigitos(v);
      if (!d) return 'Escribe tu teléfono.';
      if (internacional) {
        if (d.length < 8 || d.length > 15) return 'Escribe el número completo con el código del país.';
        return '';
      }
      if (d.length !== 10) return 'El teléfono debe tener 10 dígitos.';
      if (AREAS_RD.indexOf(d.slice(0, 3)) === -1) {
        return 'Debe empezar en 809, 829 u 849. Si es del exterior, usa +.';
      }
      return '';
    },
    correo: function (v) {
      if (!v) return 'Escribe tu correo.';
      if (!RE_CORREO.test(v)) return 'Escribe un correo válido, como maria@correo.com.';
      if (v.length > 120) return 'El correo es demasiado largo.';
      return '';
    },
    correo2: function (v) {
      if (!v) return 'Repite tu correo.';
      if (v.toLowerCase() !== campos.correo.value.trim().toLowerCase()) {
        return 'Los correos no coinciden.';
      }
      return '';
    }
  };

  /* ------------------------------------------------------ Estado visual -- */
  function contenedor(input) { return input.closest('.field'); }

  function marcarError(input, mensaje) {
    var box = contenedor(input);
    box.classList.add('has-error');
    box.classList.remove('is-valid');
    input.setAttribute('aria-invalid', 'true');
    var p = box.querySelector('.error');
    if (p) p.textContent = mensaje;
  }

  function limpiarError(input, valido) {
    var box = contenedor(input);
    box.classList.remove('has-error');
    box.classList.toggle('is-valid', !!valido);
    input.removeAttribute('aria-invalid');
    var p = box.querySelector('.error');
    if (p) p.textContent = '';
  }

  function validarCampo(clave, mostrar) {
    var input = campos[clave];
    var valor = input.value.trim();
    var error = reglas[clave](valor);
    if (error) {
      if (mostrar) marcarError(input, error);
      return false;
    }
    limpiarError(input, valor.length > 0);
    return true;
  }

  function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.classList.add('is-visible');
    estado.textContent = texto;
  }

  function ocultarAviso() {
    aviso.textContent = '';
    aviso.classList.remove('is-visible');
  }

  function cargando(activo) {
    enviando = activo;
    boton.disabled = activo;
    boton.classList.toggle('is-sending', activo);
    botonTxt.textContent = activo ? 'Enviando...' : 'Confirmar asistencia';
    boton.setAttribute('aria-busy', activo ? 'true' : 'false');
  }

  /* -------------------------------------------------------- Interaccion -- */
  Object.keys(campos).forEach(function (clave) {
    var input = campos[clave];

    input.addEventListener('blur', function () {
      if (input.value.trim()) validarCampo(clave, true);
    });

    input.addEventListener('input', function () {
      if (contenedor(input).classList.contains('has-error')) {
        validarCampo(clave, false);   // limpia el error apenas se corrige
      }
      ocultarAviso();
    });
  });

  // Mascara de cedula: mantiene el cursor al final mientras se escribe
  campos.cedula.addEventListener('input', function () {
    var alFinal = this.selectionStart === this.value.length;
    var formateado = formatearCedula(this.value);
    if (formateado !== this.value) {
      this.value = formateado;
      if (alFinal) this.setSelectionRange(formateado.length, formateado.length);
    }
  });

  // Mascara de telefono
  campos.telefono.addEventListener('input', function () {
    var alFinal = this.selectionStart === this.value.length;
    var formateado = formatearTelefono(this.value);
    if (formateado !== this.value) {
      this.value = formateado;
      if (alFinal) this.setSelectionRange(formateado.length, formateado.length);
    }
  });

  campos.telefono.addEventListener('paste', function (e) {
    e.preventDefault();
    var texto = (e.clipboardData || window.clipboardData).getData('text');
    this.value = formatearTelefono(texto);
    validarCampo('telefono', true);
  });

  campos.cedula.addEventListener('paste', function (e) {
    e.preventDefault();
    var texto = (e.clipboardData || window.clipboardData).getData('text');
    this.value = formatearCedula(texto);
    validarCampo('cedula', true);
  });

  // Normaliza los correos en minusculas al salir del campo
  campos.correo.addEventListener('blur', function () {
    this.value = this.value.trim().toLowerCase();
    // Si ya habia escrito la confirmacion, la revisamos de nuevo
    if (campos.correo2.value.trim()) validarCampo('correo2', true);
  });
  campos.correo2.addEventListener('blur', function () {
    this.value = this.value.trim().toLowerCase();
  });

  /* ------------------------------------------------------------- Envio -- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;
    ocultarAviso();

    // Validacion completa
    var claves = Object.keys(campos);
    var primerFallo = null;
    claves.forEach(function (clave) {
      var ok = validarCampo(clave, true);
      if (!ok && !primerFallo) primerFallo = campos[clave];
    });

    if (primerFallo) {
      primerFallo.focus();
      primerFallo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      mostrarAviso('Revisa los campos marcados para continuar.');
      return;
    }

    // Trampa anti-bot: si el campo oculto trae texto, no fue una persona
    if (honeypot && honeypot.value) return;

    var datos = {
      nombre:            campos.nombre.value.trim().replace(/\s+/g, ' '),
      apellido:          campos.apellido.value.trim().replace(/\s+/g, ' '),
      cedula:            soloDigitos(campos.cedula.value),
      cedula_formateada: formatearCedula(campos.cedula.value),
      telefono:            (campos.telefono.value.trim().charAt(0) === '+' ? '+' : '') + soloDigitos(campos.telefono.value),
      telefono_formateado: formatearTelefono(campos.telefono.value),
      correo:            campos.correo.value.trim().toLowerCase(),
      evento:            CONFIG.evento,
      origen:            window.location.href,
      enviado_en:        new Date().toISOString()
    };

    cargando(true);
    estado.textContent = 'Enviando tu confirmación.';

    // Los bots completan y envian en milisegundos: retrasamos ese caso sin
    // molestar a nadie, en vez de rechazar el envio.
    var espera = Math.max(0, 1200 - (Date.now() - abiertoEn));

    esperar(espera)
      .then(function () { return enviar(datos); })
      .then(function () { mostrarExito(datos); })
      .catch(function (err) {
        cargando(false);
        mostrarAviso(mensajeDeError(err));
      });
  });

  function esperar(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** Envia al backend, o simula el envio si aun no hay endpoint. */
  function enviar(datos) {
    if (!CONFIG.endpoint) {
      // -------- Modo demo: sin backend todavia --------
      if (window.console) console.info('[Days to Shine] Sin endpoint. Datos listos para enviar:', datos);
      return new Promise(function (resolve) { setTimeout(resolve, CONFIG.demoDelayMs); });
    }

    var control = ('AbortController' in window) ? new AbortController() : null;
    var reloj = control ? setTimeout(function () { control.abort(); }, CONFIG.timeoutMs) : null;

    return fetch(CONFIG.endpoint, {
      method: CONFIG.metodo,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(datos),
      signal: control ? control.signal : undefined
    }).then(function (res) {
      if (reloj) clearTimeout(reloj);
      return res.json().catch(function () { return {}; }).then(function (cuerpo) {
        if (res.ok && cuerpo.ok !== false) return cuerpo;
        var e = new Error(cuerpo.error || 'error_servidor');
        e.codigo = res.status;
        e.motivo = cuerpo.error;
        throw e;
      });
    }, function (err) {
      if (reloj) clearTimeout(reloj);
      var e = new Error('sin_conexion');
      e.motivo = (err && err.name === 'AbortError') ? 'tiempo_agotado' : 'sin_conexion';
      throw e;
    });
  }

  function mensajeDeError(err) {
    var motivo = (err && (err.motivo || err.message)) || '';
    if (err && err.codigo === 409 || motivo === 'duplicado') {
      return 'Esta cédula o correo ya tiene una asistencia confirmada.';
    }
    if (motivo === 'tiempo_agotado') {
      return 'La conexión tardó demasiado. Inténtalo de nuevo.';
    }
    if (motivo === 'sin_conexion') {
      return 'No pudimos conectar. Revisa tu internet e inténtalo de nuevo.';
    }
    return 'No pudimos guardar tu confirmación. Inténtalo de nuevo en un momento.';
  }

  /* ------------------------------------------------------------ Exito -- */
  function mostrarExito(datos) {
    document.getElementById('r-nombre').textContent = datos.nombre + ' ' + datos.apellido;
    document.getElementById('r-cedula').textContent = datos.cedula_formateada;
    document.getElementById('r-telefono').textContent = datos.telefono_formateado;
    document.getElementById('r-correo').textContent = datos.correo;

    vistaForm.hidden = true;
    vistaOk.hidden = false;
    estado.textContent = 'Asistencia confirmada. Gracias, ' + datos.nombre + '.';
    vistaOk.scrollIntoView({ block: 'center', behavior: 'smooth' });
    vistaOk.focus({ preventScroll: true });
  }

})();
