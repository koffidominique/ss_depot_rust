import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { BrandRef, Brewery } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

export function BreweryQuickSelect({
  form,
  breweries,
  brands,
  value,
  onChange,
}: {
  form: UseFormReturn<ProductFormValues>;
  breweries?: Brewery[];
  brands?: BrandRef[];
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const created = await apiClient.createBrewery({ name: clean, countryCode: 'CI' });
      await qc.invalidateQueries({ queryKey: ['breweries'] });
      onChange(created.id);
      setName('');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor="product-brewery"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Fabricant / Brasserie
        </label>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#2563EB] hover:underline"
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </button>
      </div>
      <select
        id="product-brewery"
        value={value ?? ''}
        onChange={(e) => {
          const nextId = e.target.value ? Number(e.target.value) : null;
          onChange(nextId);
          const curBrandId = form.getValues('brand_id');
          if (nextId && curBrandId && brands) {
            const br = brands.find((b) => b.id === curBrandId);
            if (br?.brewery_id && br.brewery_id !== nextId) {
              form.setValue('brand_id', null);
            }
          }
        }}
        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      >
        <option value="">-- Non précisé --</option>
        {breweries?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom brasserie..."
            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="rounded bg-[#2563EB] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

export function BrandQuickSelect({
  form,
  brands,
  value,
  onChange,
}: {
  form: UseFormReturn<ProductFormValues>;
  brands?: BrandRef[];
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedBreweryId = form.watch('brewery_id');
  const filteredBrands =
    brands?.filter(
      (b) => !selectedBreweryId || !b.brewery_id || b.brewery_id === selectedBreweryId,
    ) ?? [];

  const handleCreate = async () => {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const code = `BRD-${clean.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || Date.now()}`;
      const created = await apiClient.createBrandV4({
        code,
        name: clean,
        breweryId: selectedBreweryId,
        countryOfOrigin: 'CI',
      });
      await qc.invalidateQueries({ queryKey: ['brands-v4'] });
      onChange(created.id);
      form.setValue('brand', created.name);
      setName('');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor="product-brand-ref"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Marque référentielle
        </label>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#2563EB] hover:underline"
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </button>
      </div>
      <select
        id="product-brand-ref"
        value={value ?? ''}
        onChange={(e) => {
          const nextId = e.target.value ? Number(e.target.value) : null;
          onChange(nextId);
          const found = brands?.find((b) => b.id === nextId);
          if (found) {
            form.setValue('brand', found.name);
            if (found.brewery_id && !form.getValues('brewery_id')) {
              form.setValue('brewery_id', found.brewery_id);
            }
          }
        }}
        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      >
        <option value="">-- Saisie libre ou aucune --</option>
        {filteredBrands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom marque..."
            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="rounded bg-[#2563EB] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
