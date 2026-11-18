import { z } from 'zod';

const optionalEmailSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide.');

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Le nom ou la raison sociale est obligatoire.'),
  client_type: z.enum(['particulier', 'professionnel']),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  credit_policy: z.enum(['forbidden', 'limited', 'unlimited']),
  credit_limit: z.number().int().min(0, 'Plafond invalide.'),
  payment_terms_days: z.number().int('Nombre entier requis.').min(0, 'Délai positif ou nul requis.'),
});

export const editClientSchema = z.object({
  name: z.string().trim().min(1, 'Le nom ou la raison sociale est obligatoire.'),
  client_type: z.enum(['particulier', 'professionnel']),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  is_active: z.boolean(),
});

export type CreateClientValues = z.infer<typeof createClientSchema>;
export type EditClientValues = z.infer<typeof editClientSchema>;
