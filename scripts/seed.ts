import 'dotenv/config';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { DEFAULT_SYSTEM_ROLES } from '@/lib/permissions';
import {
  ActivityPriority,
  ActivityStatus,
  ClientType,
  Currency,
  DiscountType,
  IdentificationType,
  OpportunityStatus,
  QuotationStatus,
} from '@/generated/prisma/enums';

/**
 * Seed de desarrollo. Idempotente: corre las veces que quieras sin duplicar.
 * Usa ids fijos en los registros que no tienen clave única natural para poder
 * hacer upsert por id.
 */

const PASSWORD = 'Minerva2026!';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function seed() {
  const passwordHash = await hashPassword(PASSWORD);

  // --- RF-009/RF-010: roles de fábrica -------------------------------------
  // Se crean por id fijo (r_def_*) solo si no existen. Si un administrador los
  // renombró o les cambió los permisos, el seed no los toca (update: {}).
  const roles = await Promise.all(
    DEFAULT_SYSTEM_ROLES.map((r) =>
      prisma.role.upsert({
        where: { id: r.id },
        update: {},
        create: {
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: true,
          isAdmin: r.isAdmin,
          isActive: true,
          permissions: { create: r.permissions.map((p) => ({ permission: p })) },
        },
      }),
    ),
  );
  const roleByKey = {
    admin: roles.find((r) => r.id === DEFAULT_SYSTEM_ROLES[0].id)!,
    comercial: roles.find((r) => r.id === DEFAULT_SYSTEM_ROLES[1].id)!,
    consulta: roles.find((r) => r.id === DEFAULT_SYSTEM_ROLES[2].id)!,
  };
  console.info(`[seed] Roles listos: ${roles.length}`);

  // --- RF-01: usuarios (RF-006, RF-009) -------------------------------------
  // En una base que ya tiene usuarios (producción) el seed NO crea usuarios de
  // demo: solo reutiliza uno administrador y uno no-administrador para ser
  // dueños de los registros de ejemplo. En una base vacía (dev) crea los
  // usuarios demo de siempre con la contraseña fija del seed.
  const existingUsers = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  let users: typeof existingUsers;
  if (existingUsers.length > 0) {
    users = existingUsers;
  } else {
    users = await Promise.all(
      (
        [
          { email: 'admin@minerva.cr', firstName: 'Ana', lastName: 'Rojas', roleId: roleByKey.admin.id },
          { email: 'comercial@minerva.cr', firstName: 'Luis', lastName: 'Vargas', roleId: roleByKey.comercial.id },
          { email: 'consulta@minerva.cr', firstName: 'Marta', lastName: 'Jiménez', roleId: roleByKey.consulta.id },
          { email: 'demo@minerva.cr', firstName: 'Diego', lastName: 'Castro', roleId: roleByKey.comercial.id },
        ] as const
      ).map((u) =>
        prisma.user.upsert({
          where: { email: u.email },
          update: { passwordHash, roleId: u.roleId, isActive: true },
          create: { ...u, passwordHash, phone: '+506 8000 0000', isActive: true },
        }),
      ),
    );
  }
  const admin = users.find((u) => u.roleId === roleByKey.admin.id) ?? users[0];
  const comercial = users.find((u) => u.roleId === roleByKey.comercial.id) ?? users[1] ?? admin;
  console.info(
    existingUsers.length > 0
      ? `[seed] Base con ${existingUsers.length} usuarios: se reutilizan como dueños del demo.`
      : `[seed] Usuarios listos: ${users.length}`,
  );

  // --- RF-09: datos de la empresa que imprime (RF-097, RF-101) --------------
  await prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      name: 'Minerva Consultores',
      legalName: 'Minerva Consultores S.A.',
      taxId: '3-101-482930',
      address: 'Av. Reforma 210, San José, Costa Rica',
      phone: '+506 2222 1010',
      email: 'facturacion@minerva.cr',
      website: 'https://minerva.cr',
      defaultTermsAndConditions:
        'Precios en colones, más IVA. Vigencia de la oferta: 15 días naturales. ' +
        'Condiciones de pago: 50% al confirmar y 50% contra entrega. Plazo de entrega estimado de 15 días hábiles.',
      defaultCurrency: Currency.CRC,
      defaultTaxRate: 13,
      quotationPrefix: 'COT',
    },
  });

  // --- RF-06: etapas del pipeline (RF-059) ----------------------------------
  const stages = await Promise.all(
    (
      [
        { id: 'st_prospecto', name: 'Prospecto', position: 1, defaultProbability: 10, isWon: false, isLost: false, isActive: true },
        { id: 'st_contacto', name: 'En contacto', position: 2, defaultProbability: 25, isWon: false, isLost: false, isActive: true },
        { id: 'st_propuesta', name: 'Propuesta enviada', position: 3, defaultProbability: 50, isWon: false, isLost: false, isActive: true },
        { id: 'st_negociacion', name: 'Negociación', position: 4, defaultProbability: 75, isWon: false, isLost: false, isActive: true },
        { id: 'st_ganada', name: 'Ganada', position: 5, defaultProbability: 100, isWon: true, isLost: false, isActive: true },
        { id: 'st_perdida', name: 'Perdida', position: 6, defaultProbability: 0, isWon: false, isLost: true, isActive: true },
      ] as const
    ).map((s) => prisma.stage.upsert({ where: { name: s.name }, update: s, create: s })),
  );
  const [sProspecto, sContacto, sPropuesta, sNegociacion, sGanada, sPerdida] = stages;
  console.info(`[seed] Etapas listas: ${stages.length}`);

  // --- RF-07: tipos de actividad (RF-067) -----------------------------------
  const activityTypes = await Promise.all(
    (
      [
        { id: 'at_llamada', name: 'Llamada', color: '#0ea5e9', icon: 'phone', position: 1 },
        { id: 'at_reunion', name: 'Reunión', color: '#8b5cf6', icon: 'users', position: 2 },
        { id: 'at_tarea', name: 'Tarea', color: '#64748b', icon: 'check-square', position: 3 },
        { id: 'at_correo', name: 'Correo', color: '#10b981', icon: 'mail', position: 4 },
        { id: 'at_visita', name: 'Visita', color: '#ef4444', icon: 'map-pin', position: 5 },
      ] as const
    ).map((t) => prisma.activityType.upsert({ where: { name: t.name }, update: t, create: t })),
  );
  const [tLlamada, tReunion, tTarea, tCorreo] = activityTypes;
  console.info(`[seed] Tipos de actividad listos: ${activityTypes.length}`);

  // --- RF-04: categorías, unidades de medida y productos (RF-043, RF-042, RF-037)
  const categories = await Promise.all(
    (
      [
        { id: 'pc_auditoria', name: 'Auditoría' },
        { id: 'pc_consultoria', name: 'Consultoría' },
        { id: 'pc_capacitacion', name: 'Capacitación' },
        { id: 'pc_cursos', name: 'Cursos' },
      ] as const
    ).map((c) => prisma.productCategory.upsert({ where: { name: c.name }, update: {}, create: c })),
  );
  const categoriaPorNombre = new Map(categories.map((c) => [c.name, c]));

  // Catálogo de unidades (RF-042): se crean por id fijo y el seed no pisa
  // cambios del administrador (update: {}). Los nombres coinciden con la
  // migración 20261011220000 para que el backfill haya quedado mapeado.
  const unidades = await Promise.all(
    (
      [
        { id: 'u_unidad', name: 'UNIDAD' },
        { id: 'u_servicio', name: 'SERVICIO' },
        { id: 'u_hora', name: 'HORA' },
        { id: 'u_dia', name: 'DIA' },
        { id: 'u_mes', name: 'MES' },
        { id: 'u_ano', name: 'ANO' },
        { id: 'u_proyecto', name: 'PROYECTO' },
        { id: 'u_sesion', name: 'SESION' },
        { id: 'u_curso', name: 'CURSO' },
        { id: 'u_participante', name: 'PARTICIPANTE' },
        { id: 'u_usuario', name: 'USUARIO' },
        { id: 'u_visita', name: 'VISITA' },
      ] as const
    ).map((u) => prisma.unitOfMeasure.upsert({ where: { id: u.id }, update: {}, create: { ...u, isActive: true } })),
  );
  const unidadPorNombre = new Map(unidades.map((u) => [u.name, u]));

  // Productos demo que ya no pertenecen al catálogo (categoría de software
  // retirada). Se borran por id fijo del seed; las cotizaciones históricas lo
  // referencian con SetNull y el seed reescribe sus líneas igual.
  await prisma.product.deleteMany({
    where: { id: { in: ['pr_desarrollo', 'pr_soporte', 'pr_licencia'] } },
  });

  const products = await Promise.all(
    (
      [
        { id: 'pr_auditoria', code: 'SRV-AUD-001', name: 'Auditoría de gestión comercial', description: 'Diagnóstico y evaluación del proceso comercial con plan de mejora.', price: 950000, categoria: 'Auditoría', unidad: 'HORA' },
        { id: 'pr_consultoria', code: 'SRV-CONS-001', name: 'Consultoría en gestión comercial', description: 'Diagnóstico de proceso comercial y plan de mejora.', price: 850000, categoria: 'Consultoría', unidad: 'HORA' },
        { id: 'pr_capacitacion', code: 'SRV-CAP-001', name: 'Capacitación en gestión comercial', description: 'Sesión de formación para el equipo comercial.', price: 250000, categoria: 'Capacitación', unidad: 'SESION' },
        { id: 'pr_cursos', code: 'SRV-CUR-001', name: 'Curso CRM y gestión de ventas', description: 'Curso práctico por participante, con certificado.', price: 450000, categoria: 'Cursos', unidad: 'CURSO' },
      ] as const
    ).map((p) => {
      const categoria = categoriaPorNombre.get(p.categoria);
      const unidad = unidadPorNombre.get(p.unidad);
      if (!categoria || !unidad) throw new Error(`Seed: falta categoría/unidad para ${p.id}`);
      return prisma.product.upsert({
        where: { code: p.code },
        update: { price: p.price, taxRate: 13, unitId: unidad.id, categoryId: categoria.id },
        create: {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          price: p.price,
          taxRate: 13,
          unitId: unidad.id,
          categoryId: categoria.id,
          currency: Currency.CRC,
          isService: true,
          isActive: true,
        },
      });
    }),
  );
  console.info(`[seed] Productos listos: ${products.length}`);

  // Categorías retiradas del catálogo (por pedido): se quitan de la base.
  // Los productos que quedaran colgando de ellas quedan sin categoría (SetNull).
  await prisma.productCategory.deleteMany({
    where: { name: { in: ['Desarrollo de software', 'Soporte y mantenimiento'] } },
  });

  // --- RF-02: clientes (RF-013, RF-014, RF-016) ------------------------------
  const clients = await Promise.all(
    (
      [
        { id: 'cl_tecno', name: 'TecnoSuministros S.A.', type: ClientType.EMPRESA, identificationType: IdentificationType.CEDULA_JURIDICA, identificationNumber: '3-101-774512', email: 'compras@tecnosuministros.cr', phone: '+506 2233 7788', address: 'Zona Franca Rohrmoser, bodega 14' },
        { id: 'cl_vitalis', name: 'Clínica Vitalis', type: ClientType.EMPRESA, identificationType: IdentificationType.CEDULA_JURIDICA, identificationNumber: '3-101-228845', email: 'administracion@clinicavitalis.cr', phone: '+506 2511 9090', address: 'Escazú centro, Av. Central 1200' },
        { id: 'cl_sol', name: 'Corporación Sol del Este', type: ClientType.EMPRESA, identificationType: IdentificationType.CEDULA_JURIDICA, identificationNumber: '3-101-993310', email: 'info@soldeleste.cr', phone: '+506 2666 3030', address: 'Desamparados, Curridabat' },
        { id: 'cl_maria', name: 'María Fernanda Quesada', type: ClientType.PERSONA_FISICA, identificationType: IdentificationType.CEDULA_FISICA, identificationNumber: '1-1234-0567', email: 'mfquesada@gmail.com', phone: '+506 8877 1122', address: 'San Pedro, Montes del Sur' },
      ] as const
    ).map((c) =>
      prisma.client.upsert({
        where: { id: c.id },
        update: {},
        create: { ...c, website: null, notes: null, isActive: true, createdById: admin.id },
      }),
    ),
  );
  console.info(`[seed] Clientes listos: ${clients.length}`);

  // --- RF-03: contactos (RF-028, RF-031, RF-035) -----------------------------
  const contacts = await Promise.all(
    (
      [
        { id: 'ct_mario', clientId: 'cl_tecno', firstName: 'Mario', lastName: 'Alvarado', position: 'Jefe de compras', email: 'mario.alvarado@tecnosuministros.cr', phone: '+506 8899 2233', isPrimary: true },
        { id: 'ct_patricia', clientId: 'cl_vitalis', firstName: 'Patricia', lastName: 'Sanz', position: 'Directora administrativa', email: 'patricia.sanz@clinicavitalis.cr', phone: '+506 8822 4455', isPrimary: true },
        { id: 'ct_rafael', clientId: 'cl_vitalis', firstName: 'Rafael', lastName: 'Mora', position: 'Coordinador de TI', email: 'rmora@clinicavitalis.cr', phone: '+506 8811 6677', isPrimary: false },
        { id: 'ct_sofia', clientId: 'cl_sol', firstName: 'Sofía', lastName: 'Brenes', position: 'Gerenta general', email: 'sofia.brenes@soldeleste.cr', phone: '+506 8877 9900', isPrimary: true },
      ] as const
    ).map((c) =>
      prisma.contact.upsert({
        where: { id: c.id },
        update: {},
        create: { ...c, notes: null, isActive: true },
      }),
    ),
  );
  console.info(`[seed] Contactos listos: ${contacts.length}`);

  // --- RF-05: oportunidades (RF-047, RF-051, RF-057) ------------------------
  const opportunities = await Promise.all(
    (
      [
        { id: 'op_tecno_crm', name: 'CRM para gestión de compras', clientId: 'cl_tecno', contactId: 'ct_mario', stageId: sPropuesta.id, amount: 8400000, probability: 50, ownerId: comercial.id, expectedCloseDate: daysFromNow(21), status: OpportunityStatus.OPEN },
        { id: 'op_vitalis_crm', name: 'Plataforma de citas médicas', clientId: 'cl_vitalis', contactId: 'ct_patricia', stageId: sNegociacion.id, amount: 12500000, probability: 75, ownerId: comercial.id, expectedCloseDate: daysFromNow(12), status: OpportunityStatus.OPEN },
        { id: 'op_sol_soporte', name: 'Programa anual de capacitación', clientId: 'cl_sol', contactId: 'ct_sofia', stageId: sGanada.id, amount: 3840000, probability: 100, ownerId: comercial.id, expectedCloseDate: daysFromNow(-14), status: OpportunityStatus.WON, closedAt: daysFromNow(-15) },
        { id: 'op_maria_erp', name: 'Sistema de facturación interno', clientId: 'cl_maria', contactId: null, stageId: sContacto.id, amount: 2200000, probability: 25, ownerId: admin.id, expectedCloseDate: daysFromNow(35), status: OpportunityStatus.OPEN },
        { id: 'op_tecno_web', name: 'Rediseño de sitio corporativo', clientId: 'cl_tecno', contactId: 'ct_mario', stageId: sPerdida.id, amount: 1500000, probability: 0, ownerId: comercial.id, expectedCloseDate: daysFromNow(-40), status: OpportunityStatus.LOST, closedAt: daysFromNow(-38), lostReason: 'Eligieron una agencia interna' },
        { id: 'op_vitalis_erp', name: 'Migración de ERP a la nube', clientId: 'cl_vitalis', contactId: 'ct_rafael', stageId: sProspecto.id, amount: 9600000, probability: 10, ownerId: admin.id, expectedCloseDate: daysFromNow(60), status: OpportunityStatus.OPEN },
      ] as const
    ).map((o) =>
      prisma.opportunity.upsert({
        where: { id: o.id },
        update: {},
        create: {
          ...o,
          description: null,
          currency: Currency.CRC,
          notes: null,
        },
      }),
    ),
  );
  console.info(`[seed] Oportunidades listas: ${opportunities.length}`);

  // --- RF-07: actividades (RF-066, RF-072, RF-075) --------------------------
  const activities = await Promise.all(
    (
      [
        { id: 'ac_seguimiento_tecno', typeId: tLlamada.id, title: 'Llamar a Mario por la propuesta', clientId: 'cl_tecno', contactId: 'ct_mario', opportunityId: 'op_tecno_crm', assigneeId: comercial.id, priority: ActivityPriority.HIGH, status: ActivityStatus.PENDING, scheduledAt: daysFromNow(1) },
        { id: 'ac_reunion_vitalis', typeId: tReunion.id, title: 'Reunión con Dirección para definir alcance', clientId: 'cl_vitalis', contactId: 'ct_patricia', opportunityId: 'op_vitalis_crm', assigneeId: comercial.id, priority: ActivityPriority.URGENT, status: ActivityStatus.PENDING, scheduledAt: daysFromNow(2) },
        { id: 'ac_envio_propuesta', typeId: tCorreo.id, title: 'Enviar propuesta económica a TecnoSuministros', clientId: 'cl_tecno', contactId: 'ct_mario', opportunityId: 'op_tecno_crm', assigneeId: comercial.id, priority: ActivityPriority.MEDIUM, status: ActivityStatus.PENDING, scheduledAt: daysFromNow(-1) },
        { id: 'ac_tarea_erp', typeId: tTarea.id, title: 'Preparar questionnaire de requisitos', clientId: 'cl_maria', contactId: null, opportunityId: 'op_maria_erp', assigneeId: admin.id, priority: ActivityPriority.LOW, status: ActivityStatus.PENDING, scheduledAt: daysFromNow(5) },
        { id: 'ac_visita_sol', typeId: activityTypes[4].id, title: 'Visita de cierre del programa de capacitación', clientId: 'cl_sol', contactId: 'ct_sofia', opportunityId: 'op_sol_soporte', assigneeId: comercial.id, priority: ActivityPriority.MEDIUM, status: ActivityStatus.COMPLETED, scheduledAt: daysFromNow(-12), completedAt: daysFromNow(-12), outcome: 'Entregado y conforme. El cliente firmó el acta.' },
        { id: 'ac_llamada_tecno_web', typeId: tLlamada.id, title: 'Llamada de cierre del rediseño web', clientId: 'cl_tecno', contactId: 'ct_mario', opportunityId: 'op_tecno_web', assigneeId: comercial.id, priority: ActivityPriority.MEDIUM, status: ActivityStatus.COMPLETED, scheduledAt: daysFromNow(-39), completedAt: daysFromNow(-39), outcome: 'Perdida: el cliente contrató una agencia interna.' },
      ] as const
    ).map((a) =>
      prisma.activity.upsert({
        where: { id: a.id },
        update: {},
        create: {
          ...a,
          description: null,
          durationMinutes: 45,
          createdById: admin.id,
        },
      }),
    ),
  );
  console.info(`[seed] Actividades listas: ${activities.length}`);

  // --- RF-08: cotizaciones (RF-078, RF-085 a RF-088) -----------------------
  // Los totales se recalculan acá a mano porque la lógica compartida de
  // cotizaciones todavía no existe; cuando exista, el seed debe usar esa función.
  type Linea = { productId: string | null; description: string; quantity: number; unitPrice: number; taxRate: number };
  type CotizacionSeed = {
    id: string;
    number: string;
    clientId: string;
    contactId: string | null;
    opportunityId: string | null;
    currency: Currency;
    status: QuotationStatus;
    discountType: DiscountType;
    discountValue: number;
    termsAndConditions: string | null;
    validUntil: Date | null;
    sentAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
    lines: Linea[];
  };

  const cotizaciones: CotizacionSeed[] = [
    {
      id: 'qt_vitalis', number: 'COT-2026-0001', clientId: 'cl_vitalis', contactId: 'ct_patricia',
      opportunityId: 'op_vitalis_crm', currency: Currency.CRC, status: QuotationStatus.ACCEPTED,
      discountType: DiscountType.PERCENTAGE, discountValue: 5,
      termsAndConditions: 'Validez 15 días. 50% al confirmar, 50% contra entrega. Plazo: 20 días hábiles.',
      validUntil: daysFromNow(10), sentAt: daysFromNow(-8), acceptedAt: daysFromNow(-6), rejectedAt: null,
      lines: [
        { productId: 'pr_auditoria', description: 'Auditoría de gestión comercial — proceso de citas médicas', quantity: 20, unitPrice: 950000, taxRate: 13 },
        { productId: 'pr_capacitacion', description: 'Capacitación en gestión comercial — 8 sesiones', quantity: 8, unitPrice: 250000, taxRate: 13 },
      ],
    },
    {
      id: 'qt_tecno', number: 'COT-2026-0002', clientId: 'cl_tecno', contactId: 'ct_mario',
      opportunityId: 'op_tecno_crm', currency: Currency.CRC, status: QuotationStatus.SENT,
      discountType: DiscountType.NONE, discountValue: 0,
      termsAndConditions: 'Validez 15 días. Pago a 30 días contra factura.',
      validUntil: daysFromNow(6), sentAt: daysFromNow(-2), acceptedAt: null, rejectedAt: null,
      lines: [
        { productId: 'pr_consultoria', description: 'Consultoría en gestión comercial — diagnóstico inicial', quantity: 40, unitPrice: 850000, taxRate: 13 },
        { productId: 'pr_cursos', description: 'Curso CRM y gestión de ventas — 3 participantes', quantity: 3, unitPrice: 450000, taxRate: 13 },
      ],
    },
    {
      id: 'qt_sol', number: 'COT-2026-0003', clientId: 'cl_sol', contactId: 'ct_sofia',
      opportunityId: 'op_sol_soporte', currency: Currency.CRC, status: QuotationStatus.ACCEPTED,
      discountType: DiscountType.NONE, discountValue: 0,
      termsAndConditions: 'Renovación automática anual salvo aviso con 30 días de anticipación.',
      validUntil: daysFromNow(-10), sentAt: daysFromNow(-40), acceptedAt: daysFromNow(-30), rejectedAt: null,
      lines: [{ productId: 'pr_capacitacion', description: 'Programa anual de capacitación — 12 sesiones', quantity: 12, unitPrice: 250000, taxRate: 13 }],
    },
  ];

  for (const c of cotizaciones) {
    // Los totales de la cabecera son el snapshot que se imprime en el PDF
    // (RF-085 a RF-088): se derivan de las líneas, nunca al revés.
    const lineas = c.lines.map((l, i) => {
      const lineSubtotal = l.quantity * l.unitPrice;
      const discountPercent = c.discountType === DiscountType.PERCENTAGE ? c.discountValue : 0;
      const lineDiscount = (lineSubtotal * discountPercent) / 100;
      const base = lineSubtotal - lineDiscount;
      const lineTax = (base * l.taxRate) / 100;
      return {
        productId: l.productId,
        position: i,
        description: l.description,
        unit: 'UNIDAD',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent,
        taxRate: l.taxRate,
        lineSubtotal,
        lineDiscount,
        lineTax,
        lineTotal: base + lineTax,
      };
    });

    const subtotal = lineas.reduce((acc, l) => acc + l.lineSubtotal, 0);
    const lineDiscount = lineas.reduce((acc, l) => acc + l.lineDiscount, 0);
    const discountAmount =
      c.discountType === DiscountType.FIXED ? c.discountValue : lineDiscount;
    const taxTotal = lineas.reduce((acc, l) => acc + l.lineTax, 0);
    const total = lineas.reduce((acc, l) => acc + l.lineTotal, 0);

    await prisma.quotation.upsert({
      where: { number: c.number },
      update: {},
      create: {
        id: c.id,
        number: c.number,
        clientId: c.clientId,
        contactId: c.contactId,
        opportunityId: c.opportunityId,
        currency: c.currency,
        exchangeRateToBase: 1,
        subtotal,
        discountType: c.discountType,
        discountValue: c.discountValue,
        discountAmount,
        taxTotal,
        total,
        termsAndConditions: c.termsAndConditions,
        validUntil: c.validUntil,
        status: c.status,
        sentAt: c.sentAt,
        acceptedAt: c.acceptedAt,
        rejectedAt: c.rejectedAt,
        notes: null,
        createdById: admin.id,
      },
    });

    await prisma.quotationItem.deleteMany({ where: { quotationId: c.id } });
    await prisma.quotationItem.createMany({ data: lineas.map((l) => ({ ...l, quotationId: c.id })) });
  }
  console.info(`[seed] Cotizaciones listas: ${cotizaciones.length}`);

  console.info('');
  console.info('============================================================');
  console.info(' Seed completo. Contraseña de todos los usuarios:');
  console.info(` ${PASSWORD}`);
  console.info('');
  console.info('   admin@minerva.cr      Administrador');
  console.info('   comercial@minerva.cr  Comercial');
  console.info('   consulta@minerva.cr   Consulta (solo lectura)');
  console.info('   demo@minerva.cr       Comercial');
  console.info('============================================================');
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
