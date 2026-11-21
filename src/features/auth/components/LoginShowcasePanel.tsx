import { BarChart3, CheckCircle2, LockKeyhole, Package, Truck, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { DP_CARD_HOVER, DP_SPRING } from '../../../components/motion/MotionPrimitives.tsx';

/* ============================================================================
 * Panneau gauche de présentation sur l'écran de connexion (Hero + garanties)
 * ============================================================================ */

const FEATURE_HIGHLIGHTS = [
  { icon: Truck, title: 'Livraisons', desc: 'Suivi fournisseurs' },
  { icon: Package, title: 'Stock', desc: 'Temps réel & inventaires' },
  { icon: BarChart3, title: 'Rapports', desc: 'Analyses & marges' },
  { icon: Users, title: 'Clients', desc: 'Crédits & retour emballages' },
];

export function LoginShowcasePanel() {
  return (
    <div className="relative w-full lg:w-1/2 min-h-screen">
      {/* Image d'arrière-plan entrepôt */}
      <img
        src="/assets/aistudio/Gemini_Generated_Image_rrtmzrrtmzrrtmzr.jpeg"
        alt="Entrepôt de boissons avec caisses empilées"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Voile sombre dégradé pour le contraste */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/40" />

      {/* Motif grille subtil */}
      <div className="absolute inset-0 opacity-5">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Contenu éditorial au premier plan */}
      <div className="relative z-10 flex h-full flex-col justify-between p-8 md:p-12 lg:p-16 text-white">
        {/* En-tête marque */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20">
            <LockKeyhole className="h-7 w-7 text-white drop-shadow-lg" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">DEPOTPRO</h1>
            <p className="text-sm font-medium text-white/80">Gestion de dépôt professionnelle</p>
          </div>
        </div>

        {/* Accroche centrale & cartes fonctionnalités */}
        <div className="max-w-xl space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
              Gérez votre stock
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">
                en toute simplicité
              </span>
            </h2>
            <p className="text-lg text-white/90 max-w-md leading-relaxed">
              Solution complète pour la gestion de stock, ventes, achats, crédits clients, consignations et caisse en FCFA.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FEATURE_HIGHLIGHTS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...DP_SPRING, delay: 0.08 + i * 0.05 }}
                whileHover={DP_CARD_HOVER}
                className="group relative rounded-2xl bg-white/10 backdrop-blur-sm border border-white/25 p-4 hover:bg-white/15 hover:border-amber-300/50 hover:shadow-[0_14px_30px_-10px_rgba(251,191,36,0.28)] transition-colors"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 group-hover:bg-white/25 group-hover:scale-110 transition-all">
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="relative mt-3">
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="text-xs text-white/70">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Pied de page garanties */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/20">
          <div className="flex items-center gap-6 text-sm text-white/60">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span>Hors-ligne first</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span>Données chiffrées</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span>Conforme OHADA</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/60">
            <span>🇨🇮 FCFA</span>
            <span className="hidden sm:inline">•</span>
            <span>Local-first</span>
            <span className="hidden sm:inline">•</span>
            <span>v3.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
