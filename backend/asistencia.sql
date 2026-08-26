-- ============================================================================
-- Pink Night (Days to Shine 2026) - Tabla de confirmaciones de asistencia
-- MySQL 5.7+ / MariaDB 10.3+
-- ============================================================================

CREATE TABLE IF NOT EXISTS `asistencias` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`      VARCHAR(60)  NOT NULL,
  `apellido`    VARCHAR(60)  NOT NULL,
  `cedula`      CHAR(11)     NOT NULL COMMENT 'Solo dígitos, sin guiones',
  `telefono`    VARCHAR(20)  NOT NULL COMMENT 'Solo dígitos, con + si es del exterior',
  `correo`      VARCHAR(120) NOT NULL,
  `evento`      VARCHAR(60)  NOT NULL DEFAULT 'pink-night-2026-pink-carpet',
  `origen`      VARCHAR(255) DEFAULT NULL COMMENT 'URL desde donde se registró',
  `ip`          VARBINARY(16) DEFAULT NULL,
  `user_agent`  VARCHAR(255) DEFAULT NULL,
  `creado_en`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cedula_evento` (`cedula`, `evento`),
  UNIQUE KEY `uq_correo_evento` (`correo`, `evento`),
  KEY `idx_creado_en` (`creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportar los registros para el equipo de puerta:
-- SELECT nombre, apellido,
--        CONCAT(SUBSTRING(cedula,1,3),'-',SUBSTRING(cedula,4,7),'-',SUBSTRING(cedula,11,1)) AS cedula,
--        telefono, correo, creado_en
-- FROM asistencias
-- WHERE evento = 'pink-night-2026-pink-carpet'
-- ORDER BY creado_en DESC;
