/**
 * Catálogo de sectores y países de la cartera de clientes.
 *
 * Los sectores vienen de `Catalogo_de_Sectores.csv` (la lista que la empresa
 * usaba en Excel). Los valores de relleno que no clasifican nada se normalizan
 * a vacío al importar y no se ofrecen en el formulario.
 */
export const SECTORES = [
  'Agroindustrial',
  'Alimentos y Bebidas',
  'Ambiental y Gestión de Residuos',
  'Cámaras y Gremios Empresariales',
  'Colegios y Asociaciones Profesionales',
  'Comercial y Servicios',
  'Construcción',
  'Consultoría y Servicios Profesionales',
  'Dispositivos Médicos',
  'Educación',
  'Energía',
  'Embajadas y Comercio Exterior',
  'Gobierno y Sector Público',
  'Industrial y Manufactura',
  'Medios y Publicidad',
  'PYMES',
  'Salud',
  'Seguridad',
  'Servicios Financieros',
  'Tecnología de la Información',
  'Transporte y Logística',
  'Turismo y Hotelería',
];

/** Etiquetas que no dicen nada del cliente: al importar se guardan como vacío. */
export const SECTORES_SIN_CLASIFICAR = new Set([
  'sin clasificar',
  'no se indica',
  'otro (revisar)',
  'evento / fuente (mal clasificado en sector)',
  'cliente (sector no especificado)',
]);

export const PAISES = [
  'Costa Rica',
  'Panamá',
  'El Salvador',
  'Guatemala',
  'Nicaragua',
  'Honduras',
  'Colombia',
  'República Dominicana',
  'México',
  'Estados Unidos',
  'Brasil',
  'Chile',
  'Puerto Rico',
  'Argentina',
  'Curazao',
];
