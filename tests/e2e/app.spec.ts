import { test, expect, type Page } from '@playwright/test';

function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function enterPinDigits(page: Page, pin: string) {
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

async function loginWithPin(page: Page, pin: string, username?: string) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Déverrouiller' })).toBeVisible();
  if (username) {
    await page.getByLabel(/Identifiant/i).fill(username);
  }
  await enterPinDigits(page, pin);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
}

test.describe('DEPOTPRO PREMIUM V3 — Scénarios E2E Interface & Métier', () => {
  test.describe.configure({ mode: 'serial' });

  test('Scénario 1 — Initialisation PIN propriétaire, Tableau de bord & thème Clair/Sombre', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);

    await page.goto('/login');
    await expect(page.getByText('Créer votre PIN propriétaire')).toBeVisible();
    await enterPinDigits(page, '123456');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByText('Confirmer le code PIN')).toBeVisible();
    await enterPinDigits(page, '123456');
    await page.getByRole('button', { name: 'Enregistrer et accéder' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();

    const themeToggle = page.getByRole('button', { name: 'Changer de thème' });
    await themeToggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await themeToggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    expect(errors).toEqual([]);
  });

  test('Scénario 2 — Ouverture de caisse, création produit et catalogue POS', async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    await page.goto('/cash');
    await expect(page.getByRole('heading', { name: 'Session de caisse', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Ouvrir une session de caisse/i }).click();
    const cashDialog = page.getByRole('dialog');
    await cashDialog.locator('input').first().fill('50000');
    await cashDialog.getByRole('button', { name: "Confirmer l'ouverture" }).click();
    await expect(page.getByRole('heading', { name: /Session active/i })).toBeVisible();

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Catalogue produits & conditionnements', level: 1 })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau produit' }).click();
    const prodModal = page.getByRole('dialog');
    await prodModal.locator('input[type="text"]').first().fill('Youki Cocktail 50cl');
    await prodModal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('cell', { name: /Youki Cocktail 50cl/i })).toBeVisible();

    await page.goto('/sales/new');
    await expect(
      page.getByRole('heading', { name: 'Nouvelle vente (Point de vente)', level: 1 })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Youki Cocktail 50cl' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Scénario 3 — Navigation multi-écrans, paramètres RBAC et rapports (6 onglets)', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    const routeHeadings: Array<[string, string]> = [
      ['/stock', 'Stocks & Mouvements'],
      ['/inventories', 'Inventaires physiques'],
      ['/consignments', 'Consignations & Emballages vides'],
      ['/clients', 'Clients & Politiques de crédit'],
      ['/debts', 'Créances clients'],
      ['/suppliers', 'Fournisseurs'],
      ['/purchases', 'Approvisionnements & Réceptions'],
      ['/expenses', 'Dépenses'],
      ['/sales', 'Historique des ventes'],
    ];

    for (const [route, heading] of routeHeadings) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Paramètres généraux', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents & numérotation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Opérateurs & Rôles/i })).toBeVisible();

    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: 'Rapports & Indicateurs financiers', level: 1 })
    ).toBeVisible();
    for (const tabLabel of [
      'Stock & Valorisation',
      'Caisse & Trésorerie',
      'Créances clients',
      'Fournisseurs & Dettes',
      'Consignations',
    ]) {
      const tab = page.getByRole('tab', { name: tabLabel });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }

    expect(errors).toEqual([]);
  });

  test('Scénario 4 — Sauvegardes SQLite cohérentes et sauvegarde chiffrée AES-256-GCM (.dpbkp)', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    await page.goto('/backups');
    await expect(
      page.getByRole('heading', { name: 'Sauvegardes & Restauration', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Créer une sauvegarde maintenant' }).click();
    await expect(page.getByRole('cell', { name: /depotpro_backup_.*\.db$/i }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Sauvegarde chiffrée' }).click();
    await page.getByLabel('Phrase secrète de chiffrement').fill('DepotPro!2026');
    await page.getByRole('button', { name: 'Chiffrer et sauvegarder' }).click();
    await expect(
      page.getByRole('cell', { name: /depotpro_backup_.*\.dpbkp$/i }).first()
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});
