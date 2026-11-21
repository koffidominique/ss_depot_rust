import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  Package,
  Users,
  Truck,
  ReceiptText,
  Compass,
  ArrowRight,
  X,
} from 'lucide-react';
import { apiClient } from '../../services/api/createApiClient.ts';
import { formatFcfa, formatQty } from '../../utils/format.ts';

interface SearchDestination {
  id: string;
  group: 'Écrans' | 'Produits' | 'Clients' | 'Fournisseurs' | 'Ventes';
  title: string;
  subtitle: string;
  to: string;
}

const SCREEN_SHORTCUTS: Array<{ title: string; subtitle: string; to: string; keywords: string }> = [
  { title: 'Tableau de bord', subtitle: 'Pilotage & KPI', to: '/', keywords: 'accueil kpi alertes' },
  { title: 'Nouvelle vente', subtitle: 'Point de vente / Facturation', to: '/sales/new', keywords: 'pos caisse ticket facture' },
  { title: 'Historique des ventes', subtitle: 'Factures, retours et avoirs', to: '/sales', keywords: 'ventes annulation avoir' },
  { title: 'Clients & Politiques de crédit', subtitle: 'Fiches et plafonds', to: '/clients', keywords: 'client credit plafond' },
  { title: 'Créances clients', subtitle: 'Règlements et échéances', to: '/debts', keywords: 'dettes impayes recouvrement' },
  { title: 'Catalogue produits', subtitle: 'Articles, casiers, tarif détail', to: '/products', keywords: 'articles prix casier' },
  { title: 'Stocks & Mouvements', subtitle: 'Valorisation et ajustements', to: '/stock', keywords: 'stock alerte entree sortie' },
  { title: 'Inventaires physiques', subtitle: 'Comptages et écarts', to: '/inventories', keywords: 'inventaire comptage ecart' },
  { title: 'Retour emballages', subtitle: 'Casiers et palettes', to: '/consignments', keywords: 'retour emballage vide casier palette' },
  { title: 'Fournisseurs', subtitle: 'Contacts et dettes', to: '/suppliers', keywords: 'fournisseur dette achat' },
  { title: 'Approvisionnements', subtitle: 'Commandes et réceptions', to: '/purchases', keywords: 'achat commande reception' },
  { title: 'Session de caisse', subtitle: 'Ouverture, mouvements et clôture', to: '/cash', keywords: 'caisse especes wave orange' },
  { title: 'Dépenses', subtitle: 'Charges d’exploitation', to: '/expenses', keywords: 'depense charge carburant' },
  { title: 'Rapports financiers', subtitle: 'Rentabilité et exports PDF', to: '/reports', keywords: 'bilan rapport pdf marge' },
  { title: 'Paramètres généraux', subtitle: 'Société, logo, moyens de paiement, PIN', to: '/settings', keywords: 'logo pin parametres' },
  { title: 'Sauvegardes & Restauration', subtitle: 'Copies SQLite vérifiées', to: '/backups', keywords: 'backup sauvegarde restauration' },
];

export function GlobalSearchModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const { data: productsPage } = useQuery({
    queryKey: ['global-search', 'products', trimmed],
    queryFn: () => apiClient.listProducts({ search: trimmed }),
    enabled: open && trimmed.length >= 1,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['global-search', 'clients', trimmed],
    queryFn: () => apiClient.listClients(trimmed),
    enabled: open && trimmed.length >= 1,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['global-search', 'suppliers', trimmed],
    queryFn: () => apiClient.listSuppliers(trimmed),
    enabled: open && trimmed.length >= 1,
  });

  const { data: salesPage } = useQuery({
    queryKey: ['global-search', 'sales', trimmed],
    queryFn: () => apiClient.listSales({ search: trimmed, page: 1, pageSize: 6 }),
    enabled: open && trimmed.length >= 1,
  });

  const results = useMemo<SearchDestination[]>(() => {
    const q = trimmed.toLowerCase();
    const list: SearchDestination[] = [];

    for (const scr of SCREEN_SHORTCUTS) {
      if (
        !q ||
        scr.title.toLowerCase().includes(q) ||
        scr.subtitle.toLowerCase().includes(q) ||
        scr.keywords.includes(q)
      ) {
        list.push({
          id: `scr-${scr.to}`,
          group: 'Écrans',
          title: scr.title,
          subtitle: scr.subtitle,
          to: scr.to,
        });
      }
    }

    if (q) {
      for (const p of (productsPage?.items || []).slice(0, 5)) {
        list.push({
          id: `prod-${p.id}`,
          group: 'Produits',
          title: p.name,
          subtitle: `${p.reference} · Stock : ${formatQty(p.stock_milli, p.base_unit)}`,
          to: '/products',
        });
      }
      for (const c of (clients || []).slice(0, 4)) {
        list.push({
          id: `cli-${c.id}`,
          group: 'Clients',
          title: c.name,
          subtitle: `${c.code}${c.phone ? ` · ${c.phone}` : ''} · Encours ${formatFcfa(c.unpaid_balance)}`,
          to: '/clients',
        });
      }
      for (const s of (suppliers || []).slice(0, 4)) {
        list.push({
          id: `sup-${s.id}`,
          group: 'Fournisseurs',
          title: s.name,
          subtitle: `${s.code}${s.phone ? ` · ${s.phone}` : ''} · Solde ${formatFcfa(s.balance_due)}`,
          to: '/suppliers',
        });
      }
      for (const sale of (salesPage?.items || []).slice(0, 5)) {
        list.push({
          id: `sale-${sale.id}`,
          group: 'Ventes',
          title: `${sale.reference} · ${sale.client_name}`,
          subtitle: `Total ${formatFcfa(sale.total_amount)} · Reste ${formatFcfa(sale.remaining_amount)}`,
          to: '/sales',
        });
      }
    }

    return list.slice(0, 18);
  }, [trimmed, productsPage, clients, suppliers, salesPage]);

  const handleSelect = (dest: SearchDestination) => {
    setQuery('');
    onOpenChange(false);
    navigate(dest.to);
  };

  const renderIcon = (group: SearchDestination['group']) => {
    switch (group) {
      case 'Produits':
        return <Package className="h-4 w-4 text-[#2563EB]" />;
      case 'Clients':
        return <Users className="h-4 w-4 text-[#16A36A]" />;
      case 'Fournisseurs':
        return <Truck className="h-4 w-4 text-[#D9901A]" />;
      case 'Ventes':
        return <ReceiptText className="h-4 w-4 text-[#7C3AED]" />;
      default:
        return <Compass className="h-4 w-4 text-[#667085]" />;
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-20 z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] shadow-2xl"
        >
          <Dialog.Title className="sr-only">Recherche globale DEPOTPRO</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <Search className="h-4 w-4 text-[#667085] shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.length > 0) {
                  e.preventDefault();
                  handleSelect(results[0]);
                }
              }}
              placeholder="Rechercher un écran, produit, client, fournisseur ou n° vente..."
              aria-label="Recherche globale"
              className="flex-1 bg-transparent text-sm text-[#182230] dark:text-slate-100 placeholder:text-[#667085] focus:outline-none"
            />
            <Dialog.Close
              aria-label="Fermer la recherche"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[#667085]">
                Aucun résultat pour « {trimmed} ».
              </div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">{renderIcon(item.group)}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#182230] dark:text-slate-100 truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#667085] dark:text-slate-400 truncate">
                        <span className="font-medium">{item.group}</span> · {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
