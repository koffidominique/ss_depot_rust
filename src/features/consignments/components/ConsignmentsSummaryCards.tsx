import { Repeat } from 'lucide-react';
import { MetricCard } from '../../../components/common/MetricCard.tsx';
import { MotionStaggerGrid } from '../../../components/motion/MotionPrimitives.tsx';
import { formatFcfa, formatNumber } from '../../../utils/format.ts';

interface ConsignmentsSummaryCardsProps {
  totalDepotPieces: number;
  typesCount: number;
  totalClientPieces: number;
  totalHeldAmount: number;
}

export function ConsignmentsSummaryCards({
  totalDepotPieces,
  typesCount,
  totalClientPieces,
  totalHeldAmount,
}: ConsignmentsSummaryCardsProps) {
  return (
    <MotionStaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard
        label="Vides en stock dépôt"
        value={`${formatNumber(totalDepotPieces)} pcs`}
        hint={`${typesCount} type(s) d'emballages suivis`}
        icon={<Repeat className="h-4 w-4" />}
      />
      <MetricCard
        label="Vides détenus par les clients"
        value={`${formatNumber(totalClientPieces)} pcs`}
        tone={totalClientPieces > 0 ? 'warning' : 'default'}
        hint="Bouteilles et casiers à récupérer"
      />
      <MetricCard
        label="Valeurs d'emballages en attente"
        value={formatFcfa(totalHeldAmount)}
        hint="Séparés du chiffre d'affaires marchandises"
      />
    </MotionStaggerGrid>
  );
}
