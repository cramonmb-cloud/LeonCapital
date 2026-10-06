import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parsea una fecha en formato string, Date o Timestamp garantizando que no se desfase por zona horaria.
 */
export function parseLocalDate(dateInput: any): Date {
  if (!dateInput) return getMexicoNow();
  
  let d: Date;
  if (typeof dateInput?.toDate === 'function') {
    d = dateInput.toDate();
  } else if (dateInput?.seconds !== undefined && typeof dateInput.seconds === 'number') {
    d = new Date(dateInput.seconds * 1000);
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day, 12, 0, 0, 0);
    }
    d = new Date(dateInput);
  } else {
    d = new Date(dateInput);
  }

  if (!isNaN(d.getTime())) {
    const iso = d.toISOString();
    // Si fue guardada como medianoche UTC (ej. 2026-07-04T00:00:00.000Z en Timestamps de Firestore)
    // los primeros 10 caracteres representan la fecha original sin sesgo horario
    if (iso.endsWith('T00:00:00.000Z') || iso.endsWith('T00:00:00Z')) {
      const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, day, 12, 0, 0, 0);
    }

    const mexicoString = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const [year, month, day] = mexicoString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date();
}

/**
 * Calcula el sábado correspondiente a la semana operativa de una fecha dada,
 * forzando el cálculo al horario de la Ciudad de México.
 * La semana cambia a las 00:00 del sábado (hora CDMX).
 */
export function getSaturdayOfWeek(dateInput: any = new Date()): Date {
  const parsed = parseLocalDate(dateInput);
  // 1. Obtener la fecha en formato YYYY-MM-DD en la zona horaria de México
  const mexicoString = parsed.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [year, month, day] = mexicoString.split('-').map(Number);
  
  // 2. Crear fecha a mediodía para cálculo seguro de día de semana
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  
  // 3. Lógica: Sábado es el día 0 de la nueva semana operativa
  // Sun(0) -> -1, Mon(1) -> -2, ..., Fri(5) -> -6, Sat(6) -> -0
  const dayOfWeek = d.getDay(); 
  const diff = (dayOfWeek + 1) % 7;
  
  const saturday = new Date(year, month - 1, day - diff, 0, 0, 0, 0);
  return saturday;
}

/**
 * Calcula el número de semana operativa de abono de un préstamo (1-indexado).
 * Relativo a la fecha de referencia (por defecto hora CDMX actual).
 * Cambia exactamente a las 00:00:00 del sábado (hora CDMX).
 * La Semana 1 (S1) corresponde al primer sábado de abono (+7 días del sábado de registro).
 */
export function getCurrentLoanWeekNumber(startDateInput: any, referenceDate: Date = getMexicoNow()): number {
  const startSat = getSaturdayOfWeek(startDateInput);
  const currentSat = getSaturdayOfWeek(referenceDate);
  const diffMs = currentSat.getTime() - startSat.getTime();
  const diffWeeks = Math.round(diffMs / (1000 * 3600 * 24 * 7));
  return Math.max(0, diffWeeks);
}

/**
 * Obtiene la fecha actual normalizada al horario de la Ciudad de México
 * para cálculos consistentes en el servidor y cliente.
 */
export function getMexicoNow(): Date {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(new Date());
  
  const map: any = {};
  parts.forEach(p => map[p.type] = p.value);
  
  return new Date(
    parseInt(map.year),
    parseInt(map.month) - 1,
    parseInt(map.day),
    parseInt(map.hour),
    parseInt(map.minute),
    parseInt(map.second)
  );
}

export function generateColorPalette(numColors: number): string[] {
  const colors = [
    '#3b82f6', // blue-500
    '#22c55e', // green-500
    '#f97316', // orange-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#6366f1', // indigo-500
  ];

  if (numColors <= colors.length) {
    return colors.slice(0, numColors);
  }

  const extendedPalette: string[] = [...colors];
  for (let i = colors.length; i < numColors; i++) {
    const hash = (i.toString()).split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const h = (hash & 0xFF0000) >> 16;
    const s = (hash & 0x00FF00) >> 8;
    const l = (hash & 0x0000FF);
    extendedPalette.push(`#${('00' + h.toString(16)).slice(-2)}${('00' + s.toString(16)).slice(-2)}${('00' + l.toString(16)).slice(-2)}`);
  }

  return extendedPalette;
}

export interface ParsedEndorsement {
  name: string;
  street: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  phone: string;
  guarantees: string;
}

/**
 * Parsea de forma robusta la cadena compuesta de un aval:
 * "NOMBRE (CALLE, COLONIA, CP, CIUDAD, Tel: TELEFONO, Garantía: GARANTIAS)"
 * asegurando soporte ante saltos de línea (\n), diferentes órdenes o ausencia de espacios.
 */
export function parseEndorsement(endorsementStr: string): ParsedEndorsement {
  if (!endorsementStr) {
    return { name: '', street: '', neighborhood: '', postalCode: '', city: '', phone: '', guarantees: '' };
  }

  const trimmed = endorsementStr.trim();
  const parenIndex = trimmed.indexOf('(');

  if (parenIndex === -1) {
    return {
      name: trimmed.toUpperCase(),
      street: '',
      neighborhood: '',
      postalCode: '',
      city: '',
      phone: '',
      guarantees: ''
    };
  }

  const name = trimmed.substring(0, parenIndex).trim().toUpperCase();

  // Contenido dentro del paréntesis
  let inside = trimmed.substring(parenIndex + 1).trim();
  if (inside.endsWith(')')) {
    inside = inside.substring(0, inside.length - 1).trim();
  }

  // Extraer teléfono (Tel: ...)
  let phone = '';
  const phoneMatch = inside.match(/Tel(?:[eé]fono)?:\s*([^,]+)/i);
  if (phoneMatch) {
    phone = phoneMatch[1].trim().toUpperCase();
    inside = inside.replace(phoneMatch[0], '');
  }

  // Extraer garantías (Garantía: ...)
  let guarantees = '';
  const guaranteeMatch = inside.match(/Garant[ií]a:\s*([\s\S]+)$/i);
  if (guaranteeMatch) {
    guarantees = guaranteeMatch[1].trim().toUpperCase();
    inside = inside.replace(guaranteeMatch[0], '');
  }

  // Dar formato con saltos de línea a garantías si vienen continuas (ej. 1.- ALGO2.- OTRO)
  if (guarantees) {
    guarantees = guarantees.replace(/(\d+\.-)/g, '\n$1').trim();
  }

  // Limpiar y separar partes de la dirección
  const addressParts = inside
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => p !== '' && !p.startsWith('TEL') && !p.startsWith('GARANT'));

  let street = addressParts[0] || '';
  let neighborhood = addressParts[1] || '';
  let postalCode = addressParts[2] || '';
  let city = addressParts[3] || '';

  // Si el código postal no son números (4 o 5 dígitos) y no hay ciudad asignada
  if (postalCode && !/^\d{4,5}$/.test(postalCode) && !city) {
    city = postalCode;
    postalCode = '';
  }

  if (addressParts.length > 4 && !city) {
    city = addressParts.slice(3).join(', ');
  }

  return { name, street, neighborhood, postalCode, city, phone, guarantees };
}
