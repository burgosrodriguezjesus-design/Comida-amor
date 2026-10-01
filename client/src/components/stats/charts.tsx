// Gráficas sencillas en SVG: una sola tinta por gráfica, marcas finas,
// rejilla discreta, tooltip al pasar o tocar y tabla accesible con los datos.

import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface ColumnDatum {
  key: string;
  label: string;
  /** Texto del tooltip (fecha completa, franja horaria…). */
  title: string;
  value: number;
}

/** Ancho real del contenedor, para dibujar el SVG a tamaño natural (textos legibles). */
function useWidth(): [React.RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth || 320);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(max: number): number {
  if (max <= 4) return Math.max(1, max);
  const step = max <= 10 ? 2 : max <= 20 ? 5 : 10;
  return Math.ceil(max / step) * step;
}

/** Columnas verticales (registros por día, por hora…). */
export function ColumnChart({
  data,
  color = 'var(--brand)',
  height = 160,
  tickEvery,
  unit,
  caption,
}: {
  data: ColumnDatum[];
  color?: string;
  height?: number;
  tickEvery: number;
  unit: [string, string];
  caption: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useWidth();
  const padLeft = 28;
  const padBottom = 24;
  const padTop = 8;
  const plotW = width - padLeft;
  const plotH = height - padBottom - padTop;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  const y = (v: number) => padTop + plotH - (v / max) * plotH;
  const activeDatum = active !== null ? data[active] : null;

  return (
    <figure className="relative" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        role="img"
        aria-label={caption}
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padLeft - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular-nums">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padLeft + i * slot + (slot - barW) / 2;
          const h = (d.value / max) * plotH;
          const r = Math.min(4, barW / 2, h);
          const top = padTop + plotH - h;
          const base = padTop + plotH;
          // Extremo redondeado (4 px) y base recta.
          const path =
            h <= 0
              ? ''
              : `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${base} Z`;
          return (
            <g key={d.key}>
              {path && <path d={path} fill={color} opacity={active === null || active === i ? 1 : 0.45} />}
              {i % tickEvery === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                  {d.label}
                </text>
              )}
              {/* Zona de toque más grande que la barra */}
              <rect
                x={padLeft + i * slot}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(active === i ? null : i)}
              >
                <title>{`${d.title}: ${d.value} ${d.value === 1 ? unit[0] : unit[1]}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      {activeDatum && active !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-1.5 text-center text-xs whitespace-nowrap text-bg shadow-soft-lg"
          style={{ left: `${((padLeft + active * slot + slot / 2) / width) * 100}%` }}
        >
          <span className="block font-semibold">{activeDatum.title}</span>
          {activeDatum.value} {activeDatum.value === 1 ? unit[0] : unit[1]}
        </div>
      )}
      <DataTable
        caption={caption}
        headers={['', unit[1]]}
        rows={data.filter((d) => d.value > 0).map((d) => [d.title, String(d.value)])}
      />
    </figure>
  );
}

/** Lista ordenada con barras horizontales finas y el valor al final. */
export function BarList({
  items,
  color = 'var(--brand)',
  empty,
}: {
  items: { label: ReactNode; value: number; key: string }[];
  color?: string;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-[15px] text-ink-2">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[15px]">
            <span className="min-w-0 truncate text-ink">{item.label}</span>
            <span className="shrink-0 font-semibold text-ink-2 tabular-nums">{item.value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-r-[4px]" aria-hidden="true">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Tabla con los datos de una gráfica (para lectores de pantalla y para quien prefiera números). */
export function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink-3 hover:text-ink-2" aria-controls={id}>
        Ver los datos
      </summary>
      <div id={id} className="mt-2 max-h-64 overflow-auto rounded-2xl border border-line">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2 text-ink-2">
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col" className={clsx('px-3 py-2 font-semibold', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-line">
                {row.map((cell, i) => (
                  <td key={i} className={clsx('px-3 py-1.5', i > 0 && 'text-right tabular-nums')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
