import 'dotenv/config';
import fs from 'node:fs';
import { prisma } from '@/lib/db';
import { SECTORES_SIN_CLASIFICAR } from '@/lib/sectores';
import { ClientType } from '@/generated/prisma/enums';

/**
 * Importa la base histórica de la empresa (CSV de Excel) al CRM.
 *
 * Reglas:
 *  - 1 fila del CSV = 1 contacto.
 *  - "Empresa" = 1 cliente (EMPRESA). Si no hay empresa, la persona se crea
 *    como cliente PERSONA_FISICA.
 *  - Se descartan filas sin nombre y filas sin correo válido (van a un CSV
 *    aparte para completarlas a mano).
 *  - Duplicados por correo: gana la fila con más datos.
 *
 * Uso:  DATABASE_URL=... npx tsx scripts/importar-contactos-csv.mts <csv> [salida]
 */

const csvEntrada = process.argv[2];
const salidaInvalidos =
  process.argv[3] ?? `${process.env.HOME ?? '/tmp'}/Downloads/contactos-sin-correo-valido.csv`;

if (!csvEntrada) {
  console.error('Uso: npx tsx scripts/importar-contactos-csv.mts <archivo.csv> [salida-invalidos.csv]');
  process.exit(1);
}

// --- CSV mínimo (RFC 4180) ---------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const limpio = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (dentroDeComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  const encabezados = filas.shift()?.map((h) => h.trim()) ?? [];
  return filas.map((f) => Object.fromEntries(encabezados.map((h, i) => [h, f[i] ?? ''])));
}

const csvEscape = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

// --- limpieza ----------------------------------------------------------------
const clean = (v?: string) => (v ?? '').trim();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const normalizar = (v: string) =>
  clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function normalizarSector(v: string): string | null {
  const s = clean(v);
  if (!s) return null;
  return SECTORES_SIN_CLASIFICAR.has(s.toLowerCase()) ? null : s.slice(0, 150);
}

/** 'Panamá (CAMCHI)' → 'Panamá'; 'Otro / No indicado' → null. */
function normalizarPais(v: string): string | null {
  const s = clean(v);
  if (!s) return null;
  if (/^otro/i.test(s)) return null;
  const m = s.match(/^([^()]+)/);
  return clean(m ? m[1] : s).slice(0, 100);
}

function telefono(v: string): string | null {
  const s = clean(v);
  if (!s || s === '0' || /^no se indica$/i.test(s)) return null;
  return s.slice(0, 30);
}

function puesto(v: string): string | null {
  const s = clean(v);
  if (!s || /^no se indica$/i.test(s)) return null;
  return s.slice(0, 150);
}

function splitNombre(full: string): { firstName: string; lastName: string } {
  const s = clean(full).replace(/\s+/g, ' ');
  const [first, ...resto] = s.split(' ');
  return { firstName: first.slice(0, 100), lastName: resto.join(' ').slice(0, 100) };
}

/** Cuántos campos útiles tiene la fila: para desempatar duplicados. */
const llenos = (r: Record<string, string>) =>
  ['Nombre', 'Correo principal', 'Correo alterno', 'Empresa', 'Puesto', 'Teléfono', 'Ubicación', 'Interés temático']
    .filter((c) => clean(r[c])).length;

// --- proceso -----------------------------------------------------------------
async function main() {
  const filas = parseCsv(fs.readFileSync(csvEntrada, 'utf8'));
  console.log(`Leídas ${filas.length} filas de ${csvEntrada}`);

  const invalidos: { fila: Record<string, string>; motivo: string }[] = [];
  const porEmail = new Map<string, Record<string, string>>();

  for (const fila of filas) {
    const email = clean(fila['Correo principal']).toLowerCase();
    const nombre = clean(fila['Nombre']);
    const empresa = clean(fila['Empresa']);

    if (!email && !nombre && !empresa) {
      invalidos.push({ fila, motivo: 'Fila vacía' });
      continue;
    }
    if (!email || !EMAIL_RE.test(email)) {
      invalidos.push({ fila, motivo: email ? `Correo inválido: ${email}` : 'Sin correo' });
      continue;
    }
    const anterior = porEmail.get(email);
    if (!anterior || llenos(fila) > llenos(anterior)) porEmail.set(email, fila);
  }
  console.log(`Válidas ${porEmail.size} · descartadas ${invalidos.length}`);

  const actor = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!actor) throw new Error('No hay usuarios activos para asignar la autoría.');

  type ClienteMeta = {
    key: string;
    name: string;
    type: ClientType;
    country: string | null;
    sector: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  type ContactoMeta = {
    keyCliente: string;
    firstName: string;
    lastName: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    isPrimary: boolean;
  };

  const clientes = new Map<string, ClienteMeta>();
  const contactos: ContactoMeta[] = [];
  const yaContacto = new Set<string>();
  const tienePrincipal = new Set<string>();

  for (const fila of porEmail.values()) {
    const email = clean(fila['Correo principal']).toLowerCase();
    if (yaContacto.has(email)) continue;
    yaContacto.add(email);

    const empresa = clean(fila['Empresa']);
    const nombre = clean(fila['Nombre']);
    const sinNombre = !nombre || nombre.length < 2;

    // Sin nombre y sin empresa no hay con qué crear un contacto útil.
    if (sinNombre && !empresa) {
      invalidos.push({ fila, motivo: 'Sin nombre y sin empresa' });
      yaContacto.delete(email);
      continue;
    }

    const keyCliente = empresa
      ? `E:${normalizar(empresa)}`
      : `P:${normalizar(nombre || email)}`;

    if (!clientes.has(keyCliente)) {
      clientes.set(keyCliente, {
        key: keyCliente,
        name: (empresa || nombre).slice(0, 191),
        type: empresa ? ClientType.EMPRESA : ClientType.PERSONA_FISICA,
        country: normalizarPais(fila['País']),
        sector: normalizarSector(fila['Sector']),
        address: clean(fila['Ubicación']).slice(0, 255) || null,
        email,
        phone: telefono(fila['Teléfono']),
      });
    } else {
      const c = clientes.get(keyCliente)!;
      c.country ??= normalizarPais(fila['País']);
      c.sector ??= normalizarSector(fila['Sector']);
      c.address ??= clean(fila['Ubicación']).slice(0, 255) || null;
      c.phone ??= telefono(fila['Teléfono']);
    }

    if (sinNombre) {
      // Contacto sin nombre: se registra como "Contacto principal" de la empresa.
      contactos.push({
        keyCliente,
        firstName: 'Contacto',
        lastName: 'principal',
        position: puesto(fila['Puesto']),
        phone: telefono(fila['Teléfono']),
        email,
        notes: 'Importado sin nombre en la base original.',
        isPrimary: !tienePrincipal.has(keyCliente),
      });
      tienePrincipal.add(keyCliente);
      continue;
    }

    const { firstName, lastName } = splitNombre(nombre);
    const notas: string[] = [];
    const interes = clean(fila['Interés temático']);
    if (interes && !/^no se indica$/i.test(interes)) notas.push(`Interés temático: ${interes}`);
    const alterno = clean(fila['Correo alterno']);
    if (alterno) notas.push(`Correo alterno: ${alterno}`);
    const captura = clean(fila['Fecha de captura']);
    if (captura) notas.push(`Fecha de captura: ${captura}`);

    contactos.push({
      keyCliente,
      firstName,
      lastName,
      position: puesto(fila['Puesto']),
      phone: telefono(fila['Teléfono']),
      email,
      notes: notas.length ? notas.join('\n').slice(0, 10_000) : null,
      isPrimary: !tienePrincipal.has(keyCliente),
    });
    tienePrincipal.add(keyCliente);
  }

  console.log(`Clientes a crear: ${clientes.size} · Contactos a crear: ${contactos.length}`);

  // --- escribir CSV de descartados -------------------------------------------
  if (invalidos.length) {
    const columnas = [
      'Nombre', 'Correo principal', 'Correo alterno', 'Empresa', 'Puesto',
      'Teléfono', 'País', 'Ubicación', 'Sector', 'Interés temático', 'Fecha de captura',
    ];
    const lineas = [
      [...columnas, 'Motivo de descarte'].map(csvEscape).join(','),
      ...invalidos.map((i) =>
        [...columnas.map((c) => i.fila[c] ?? ''), i.motivo].map(csvEscape).join(','),
      ),
    ];
    fs.writeFileSync(salidaInvalidos, lineas.join('\n') + '\n', 'utf8');
    console.log(`Descartados escritos en ${salidaInvalidos} (${invalidos.length} filas)`);
  }

  // --- crear clientes faltantes ----------------------------------------------
  const existentes = await prisma.client.findMany({ select: { id: true, name: true } });
  const porNombre = new Map(existentes.map((c) => [normalizar(c.name), c.id]));

  const aCrear = [...clientes.values()].filter((c) => !porNombre.has(normalizar(c.name)));
  if (aCrear.length) {
    // En tandas: el motor no da más allá de cierto tamaño por consulta.
    for (let i = 0; i < aCrear.length; i += 500) {
      const lote = aCrear.slice(i, i + 500).map((c) => {
        const { key, ...data } = c;
        void key;
        return data;
      });
      await prisma.client.createMany({ data: lote.map((d) => ({ ...d, createdById: actor.id })) });
    }
  }
  console.log(`Clientes creados: ${aCrear.length}`);

  // Volver a leer para mapear nombre → id (los nuevos ya tienen id).
  const todos = await prisma.client.findMany({ select: { id: true, name: true } });
  for (const c of todos) porNombre.set(normalizar(c.name), c.id);

  // --- crear contactos -------------------------------------------------------
  const contactosExistentes = await prisma.contact.findMany({
    where: { email: { in: contactos.map((c) => c.email).filter(Boolean) as string[] } },
    select: { email: true },
  });
  const yaExistentes = new Set(
    contactosExistentes.map((c) => (c.email ?? '').toLowerCase()),
  );

  const aCrearContactos = contactos
    .filter((c) => c.email && !yaExistentes.has(c.email.toLowerCase()))
    .map((c) => {
      const clientId = porNombre.get(normalizar(clientes.get(c.keyCliente)!.name));
      if (!clientId) return null;
      const { keyCliente, ...data } = c;
      void keyCliente;
      return { ...data, clientId };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  let creados = 0;
  for (let i = 0; i < aCrearContactos.length; i += 500) {
    const r = await prisma.contact.createMany({ data: aCrearContactos.slice(i, i + 500) });
    creados += r.count;
  }
  console.log(`Contactos creados: ${creados}`);

  const [totalClientes, totalContactos] = await Promise.all([
    prisma.client.count(),
    prisma.contact.count(),
  ]);
  console.log(`Totales en BD → clientes: ${totalClientes} · contactos: ${totalContactos}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
