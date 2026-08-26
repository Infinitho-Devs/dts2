<?php
/**
 * ============================================================================
 * Pink Night (Days to Shine 2026) - Endpoint de confirmacion
 * ----------------------------------------------------------------------------
 * Ejemplo funcional listo para usar. Pasos:
 *
 *   1. Sube este archivo a tu servidor (por ejemplo /api/asistencia.php).
 *      NO va en el CDN: el CDN solo sirve archivos estaticos.
 *   2. Corre asistencia.sql en tu base de datos.
 *   3. Completa las credenciales de abajo.
 *   4. En index.html apunta el formulario al endpoint:
 *        <form id="form-asistencia" data-endpoint="https://tu-dominio.com/api/asistencia.php">
 *
 * Recibe JSON y responde JSON. Valida de nuevo del lado del servidor: la
 * validacion del navegador es comodidad, no seguridad.
 * ============================================================================
 */

declare(strict_types=1);

/* ----------------------------- Configuracion ----------------------------- */
const DB_HOST = 'localhost';
const DB_NAME = 'daystoshine';
const DB_USER = 'usuario';
const DB_PASS = 'contrasena';

// Dominios autorizados a enviar el formulario (deja [] para permitir todos).
const ORIGENES_PERMITIDOS = [
    'https://daystoshine.do',
    'https://www.daystoshine.do',
];

/* -------------------------------- CORS ----------------------------------- */
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (ORIGENES_PERMITIDOS === [] || in_array($origen, ORIGENES_PERMITIDOS, true)) {
    header('Access-Control-Allow-Origin: ' . ($origen !== '' ? $origen : '*'));
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, ['ok' => false, 'error' => 'metodo_no_permitido']);
}

/* ------------------------------ Utilidades ------------------------------- */
function responder(int $codigo, array $cuerpo): void
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Digito de control de la cedula dominicana (mismo algoritmo que el JS). */
function cedulaValida(string $d): bool
{
    if (!preg_match('/^\d{11}$/', $d)) {
        return false;
    }
    if (preg_match('/^(\d)\1{10}$/', $d)) {
        return false;
    }
    $suma = 0;
    for ($i = 0; $i < 10; $i++) {
        $p = (int) $d[$i] * ($i % 2 === 0 ? 1 : 2);
        if ($p > 9) {
            $p -= 9;
        }
        $suma += $p;
    }
    return ((10 - ($suma % 10)) % 10) === (int) $d[10];
}

/**
 * Deja el telefono en digitos, conservando el "+" inicial de los numeros
 * internacionales. Devuelve '' si no hay nada aprovechable.
 */
function normalizarTelefono(string $v): string
{
    $v = trim($v);
    $internacional = ($v !== '' && $v[0] === '+');
    $d = preg_replace('/\D/', '', $v) ?? '';
    if ($d === '') {
        return '';
    }
    return ($internacional ? '+' : '') . mb_substr($d, 0, 15);
}

/** Valida telefono dominicano (10 digitos, 809/829/849) o internacional (+). */
function telefonoValido(string $t): bool
{
    $internacional = ($t !== '' && $t[0] === '+');
    $d = preg_replace('/\D/', '', $t) ?? '';
    if ($internacional) {
        return strlen($d) >= 8 && strlen($d) <= 15;
    }
    return strlen($d) === 10 && in_array(substr($d, 0, 3), ['809', '829', '849'], true);
}

function limpiar(string $v, int $max): string
{
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

/* ----------------------------- Datos de entrada -------------------------- */
$crudo  = file_get_contents('php://input') ?: '';
$datos  = json_decode($crudo, true);
if (!is_array($datos)) {
    $datos = $_POST;   // por si algun dia se envia como formulario clasico
}

$nombre   = limpiar((string) ($datos['nombre']   ?? ''), 60);
$apellido = limpiar((string) ($datos['apellido'] ?? ''), 60);
$cedula   = preg_replace('/\D/', '', (string) ($datos['cedula'] ?? '')) ?? '';
$telefono = normalizarTelefono((string) ($datos['telefono'] ?? ''));
$correo   = mb_strtolower(limpiar((string) ($datos['correo'] ?? ''), 120));
$evento   = limpiar((string) ($datos['evento'] ?? 'pink-night-2026-pink-carpet'), 60);
$origenUrl = limpiar((string) ($datos['origen'] ?? ''), 255);

// Trampa anti-spam del formulario
if (!empty($datos['sitio_web'])) {
    responder(200, ['ok' => true]);   // fingimos exito y no guardamos nada
}

/* ------------------------------- Validacion ------------------------------ */
$errores = [];
$reNombre = "/^[\p{L}][\p{L}'’.\- ]{1,59}$/u";

if (!preg_match($reNombre, $nombre)) {
    $errores['nombre'] = 'Nombre inválido.';
}
if (!preg_match($reNombre, $apellido)) {
    $errores['apellido'] = 'Apellido inválido.';
}
if (!cedulaValida($cedula)) {
    $errores['cedula'] = 'Cédula inválida.';
}
if (!telefonoValido($telefono)) {
    $errores['telefono'] = 'Teléfono inválido.';
}
if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
    $errores['correo'] = 'Correo inválido.';
}

if ($errores !== []) {
    responder(422, ['ok' => false, 'error' => 'datos_invalidos', 'campos' => $errores]);
}

/* -------------------------------- Guardado ------------------------------- */
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );

    $sql = 'INSERT INTO asistencias
              (nombre, apellido, cedula, telefono, correo, evento, origen, ip, user_agent)
            VALUES
              (:nombre, :apellido, :cedula, :telefono, :correo, :evento, :origen, :ip, :ua)';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':nombre'   => $nombre,
        ':apellido' => $apellido,
        ':cedula'   => $cedula,
        ':telefono' => $telefono,
        ':correo'   => $correo,
        ':evento'   => $evento,
        ':origen'   => $origenUrl !== '' ? $origenUrl : null,
        ':ip'       => @inet_pton($_SERVER['REMOTE_ADDR'] ?? '') ?: null,
        ':ua'       => mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
    ]);

    responder(201, ['ok' => true, 'id' => (int) $pdo->lastInsertId()]);

} catch (PDOException $e) {
    // 23000 = violacion de clave unica -> ya estaba registrada
    if ($e->getCode() === '23000') {
        responder(409, ['ok' => false, 'error' => 'duplicado']);
    }
    error_log('[daystoshine] ' . $e->getMessage());
    responder(500, ['ok' => false, 'error' => 'error_servidor']);
}
