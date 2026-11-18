import { z } from 'zod';

const optionalEmailSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide.');

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du fournisseur est obligatoire.'),
  company_name: z.string(),
  phone: z.string().trim().min(1, 'Le téléphone du fournisseur est obligatoire.'),
  address: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  payment_terms_days: z
    .number()
    .int('Nombre entier requis.')
    .min(0, 'Délai positif ou nul requis.'),
});

export const editSupplierSchema = createSupplierSchema.extend({
  is_active: z.boolean(),
});

export type CreateSupplierValues = z.infer<typeof createSupplierSchema>;
export type EditSupplierValues = z.infer<typeof editSupplierSchema>;
