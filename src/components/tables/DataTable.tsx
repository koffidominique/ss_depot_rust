import { useState } from 'react';
import { motion } from 'motion/react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DP_BUTTON_HOVER,
  DP_BUTTON_TAP,
  DP_EASE,
  DP_SPRING_SNAPPY,
} from '../motion/MotionPrimitives.tsx';
import { cn } from '../../utils/format.ts';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (nextPage: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  page = 1,
  totalPages = 1,
  total,
  onPageChange,
  onRowClick,
  emptyMessage = 'Aucune donnée disponible.',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: DP_EASE }}
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50"
              >
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-2.5 text-xs font-semibold text-[#667085] dark:text-slate-400 whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-[#182230] dark:hover:text-slate-200"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-[#667085] dark:text-slate-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIdx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.18,
                    delay: Math.min(rowIdx * 0.015, 0.18),
                    ease: DP_EASE,
                  }}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-800/60',
                    onRowClick ? 'cursor-pointer' : ''
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5 text-sm text-[#182230] dark:text-slate-200">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && (totalPages > 1 || (total ?? 0) > 0) && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-[#667085] dark:text-slate-400">
          <span className="tabular-nums">
            Page {page} sur {totalPages}
            {total !== undefined ? ` · ${total} élément(s)` : ''}
          </span>
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={page <= 1 ? undefined : DP_BUTTON_HOVER}
              whileTap={page <= 1 ? undefined : DP_BUTTON_TAP}
              transition={DP_SPRING_SNAPPY}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 hover:border-[#2563EB]/40 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Précédent
            </motion.button>
            <motion.button
              type="button"
              whileHover={page >= totalPages ? undefined : DP_BUTTON_HOVER}
              whileTap={page >= totalPages ? undefined : DP_BUTTON_TAP}
              transition={DP_SPRING_SNAPPY}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 hover:border-[#2563EB]/40 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Suivant
              <ChevronRight className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
