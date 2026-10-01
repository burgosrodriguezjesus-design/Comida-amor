// Informe en PDF para entregar al médico: limpio, cronológico y en A4.

import { MEAL_TYPE_LABELS, SYMPTOM_LABELS } from '@shared/constants';
import { daysInclusive, eachDay, localDateTimeParts } from '@shared/dates';
import type { Entry } from '@shared/types';
import { blobToDataUrl } from './image';
import { longDateWithYear, numericDate, shortDate } from './format';

export interface ReportOptions {
  name: string;
  from: string;
  to: string;
  includeNotes: boolean;
  includeFeelings: boolean;
  includePhotos: boolean;
  includeEmptyDays: boolean;
}

export function itemText(item: { name: string; quantity: string }): string {
  return item.quantity ? `${item.name} (${item.quantity})` : item.name;
}

export function feelingText(entry: Entry): string {
  const symptoms = entry.symptoms.map((s) => (s === 'otros' && entry.otherSymptoms ? `Otros: ${entry.otherSymptoms}` : SYMPTOM_LABELS[s]));
  return [symptoms.join(', '), entry.feelingNote].filter(Boolean).join('. ');
}

export function groupByDay(entries: Entry[], from: string, to: string, includeEmpty: boolean) {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const day = entry.eatenAt.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  const days = includeEmpty ? eachDay(from, to) : Array.from(map.keys()).sort();
  return days.map((date) => ({ date, entries: (map.get(date) ?? []).sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)) }));
}

export function reportSummary(entries: Entry[], from: string, to: string) {
  const days = new Set(entries.map((e) => e.eatenAt.slice(0, 10)));
  return {
    daysInRange: daysInclusive(from, to),
    daysWithEntries: days.size,
    entries: entries.length,
    drinks: entries.reduce((n, e) => n + e.items.filter((i) => i.kind === 'drink').length, 0),
    withSymptoms: entries.filter((e) => e.symptoms.some((s) => s !== 'sin_sintomas')).length,
  };
}

export function reportFileName(from: string, to: string): string {
  return `diario-alimentacion_${from}_${to}.pdf`;
}

const INK: [number, number, number] = [45, 36, 32];
const MUTED: [number, number, number] = [120, 108, 100];
const LINE: [number, number, number] = [228, 216, 203];
const BRAND: [number, number, number] = [189, 80, 56];
const WARM: [number, number, number] = [248, 241, 233];

export async function generateReportPdf(entries: Entry[], options: ReportOptions): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  const summary = reportSummary(entries, options.from, options.to);
  const now = localDateTimeParts(new Date());
  const generated = `${numericDate(now.date)} a las ${now.time}`;

  doc.setProperties({
    title: `Diario de alimentación · ${options.name}`,
    subject: `Del ${numericDate(options.from)} al ${numericDate(options.to)}`,
    creator: 'Comida Amor',
  });

  // ---------- Cabecera ----------
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('Diario de alimentación', margin, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text('Registro personal para la consulta médica', margin, 26);

  const meta: [string, string][] = [
    ['Nombre', options.name || '—'],
    ['Periodo', `${numericDate(options.from)} – ${numericDate(options.to)} (${summary.daysInRange} días)`],
    ['Generado', generated],
  ];
  let y = 35;
  doc.setFontSize(9.5);
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.text(value, margin + 24, y);
    y += 5.5;
  }

  // ---------- Resumen ----------
  y += 3;
  const boxes: [string, string][] = [
    [String(summary.daysWithEntries), 'días con registros'],
    [String(summary.entries), 'registros'],
    [String(summary.drinks), 'bebidas anotadas'],
  ];
  if (options.includeFeelings) boxes.push([String(summary.withSymptoms), 'con síntomas anotados']);
  const gap = 4;
  const boxW = (contentW - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach(([value, label], i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(...WARM);
    doc.roundedRect(x, y, boxW, 17, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(value, x + 4, y + 8.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 4, y + 13.5);
  });
  y += 25;

  // ---------- Días ----------
  const showExtra = options.includeNotes || options.includeFeelings;
  const columns = ['Hora', 'Tipo', 'Alimentos', 'Bebidas', ...(showExtra ? ['Notas y cómo se encontraba'] : [])];
  const columnStyles: Record<string, { cellWidth: number | 'auto'; fontStyle?: 'bold' }> = showExtra
    ? { 0: { cellWidth: 13, fontStyle: 'bold' as const }, 1: { cellWidth: 25 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 'auto' as const } }
    : { 0: { cellWidth: 14, fontStyle: 'bold' as const }, 1: { cellWidth: 26 }, 2: { cellWidth: 82 }, 3: { cellWidth: 'auto' as const } };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 22) {
      doc.addPage();
      y = 20;
    }
  };

  for (const day of groupByDay(entries, options.from, options.to, options.includeEmptyDays)) {
    const title = longDateWithYear(day.date).toUpperCase();
    if (day.entries.length === 0) {
      ensureSpace(14);
      doc.setFillColor(...WARM);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(title, margin + 3, y + 5.4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text('Sin registros', pageW - margin - 3, y + 5.4, { align: 'right' });
      y += 12;
      continue;
    }
    ensureSpace(30);
    const body = day.entries.map((entry) => {
      const foods = entry.items.filter((i) => i.kind === 'food').map(itemText).join('\n');
      const drinks = entry.items.filter((i) => i.kind === 'drink').map(itemText).join('\n');
      const extra: string[] = [];
      if (options.includeNotes && entry.notes) extra.push(`Notas: ${entry.notes}`);
      if (options.includeFeelings) {
        const feeling = feelingText(entry);
        if (feeling) extra.push(`Cómo se encontraba: ${feeling}`);
      }
      return [
        entry.eatenAt.slice(11, 16),
        MEAL_TYPE_LABELS[entry.mealType],
        foods || '—',
        drinks || '—',
        ...(showExtra ? [extra.join('\n') || ''] : []),
      ];
    });
    const count = `${day.entries.length} ${day.entries.length === 1 ? 'registro' : 'registros'}`;
    // La cabecera del día forma parte de la tabla: si continúa en otra página, se repite.
    const dayHead = [
      { content: title, colSpan: columns.length - 1, styles: { fillColor: WARM, fontStyle: 'bold' as const, fontSize: 10, textColor: INK, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 2 } } },
      { content: count, styles: { fillColor: WARM, halign: 'right' as const, fontStyle: 'normal' as const, fontSize: 8.5, textColor: MUTED, cellPadding: { top: 2.6, bottom: 2.4, left: 2, right: 3 } } },
    ];
    autoTable(doc, {
      startY: y,
      head: [dayHead, columns],
      body,
      theme: 'plain',
      margin: { left: margin, right: margin, bottom: 22, top: 20 },
      styles: { font: 'helvetica', fontSize: 8.8, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, valign: 'top', overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTED },
      columnStyles,
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      didDrawCell: (data) => {
        if (data.section === 'body') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.2);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ---------- Fotografías ----------
  const withPhotos = options.includePhotos ? entries.filter((e) => e.photos.length > 0) : [];
  if (withPhotos.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text('Fotografías', margin, y);
    y += 8;
    const cols = 3;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const imgH = cellW * 0.75;
    let col = 0;
    for (const entry of withPhotos) {
      for (const photo of entry.photos) {
        if (col === 0) ensureSpace(imgH + 10);
        try {
          const blob = await (await fetch(photo.thumbUrl, { credentials: 'same-origin' })).blob();
          const dataUrl = await blobToDataUrl(blob);
          const x = margin + col * (cellW + gap);
          doc.addImage(dataUrl, 'JPEG', x, y, cellW, imgH, undefined, 'FAST');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text(`${shortDate(entry.eatenAt.slice(0, 10))} · ${entry.eatenAt.slice(11, 16)} · ${MEAL_TYPE_LABELS[entry.mealType]}`, x, y + imgH + 4);
          col += 1;
          if (col === cols) {
            col = 0;
            y += imgH + 10;
          }
        } catch {
          /* si una foto no se puede cargar, se omite */
        }
      }
    }
  }

  // ---------- Pie de página ----------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      'Registro personal elaborado con Comida Amor. No contiene diagnósticos ni valoraciones médicas.',
      margin,
      pageH - 9,
    );
    doc.text(`Página ${page} de ${pages}`, pageW - margin, pageH - 9, { align: 'right' });
  }

  return doc.output('blob');
}
